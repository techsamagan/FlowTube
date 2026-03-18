import asyncio
from httpx import AsyncClient

from app.config import settings
from app.database import async_session
from app.models import Job

REPLICATE_API = "https://api.replicate.com/v1"
# minimax/video-01 is in Replicate's "Try for Free" collection (no payment required)
REPLICATE_MODEL = "minimax/video-01"


def _get_video_url(output) -> str | None:
    if isinstance(output, str):
        return output
    if isinstance(output, dict):
        for key in ("url", "video", "output"):
            if key in output and isinstance(output[key], str):
                return output[key]
    if isinstance(output, list) and output:
        first = output[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict) and "url" in first:
            return first["url"]
    return None


async def run_video_generation(job_id: str) -> None:
    async with async_session() as session:
        row = await session.get(Job, job_id)
        if not row or row.status not in ("queued", "running"):
            return
        prompt = row.prompt

    token = (settings.replicate_api_token or "").strip()
    if not token:
        async with async_session() as session:
            row = await session.get(Job, job_id)
            if row:
                row.status = "failed"
                row.error_message = (
                    "REPLICATE_API_TOKEN not set. Get a free token at "
                    "https://replicate.com/account/api-tokens (Try for Free models need no payment)."
                )
                await session.commit()
        return

    try:
        async with async_session() as session:
            row = await session.get(Job, job_id)
            if not row:
                return
            row.status = "running"
            await session.commit()

        async with AsyncClient(timeout=300.0) as client:
            # Create prediction (official model endpoint)
            owner, name = REPLICATE_MODEL.split("/")
            r = await client.post(
                f"{REPLICATE_API}/models/{owner}/{name}/predictions",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={"input": {"prompt": prompt, "prompt_optimizer": True}},
            )
            r.raise_for_status()
            data = r.json()
            pred_id = data.get("id")
            if pred_id:
                async with async_session() as session:
                    row = await session.get(Job, job_id)
                    if row:
                        row.provider_job_id = pred_id
                        await session.commit()

            # Poll until terminal state
            while data.get("status") not in ("succeeded", "failed", "canceled"):
                await asyncio.sleep(5)
                r = await client.get(
                    f"{REPLICATE_API}/predictions/{data['id']}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                r.raise_for_status()
                data = r.json()

            if data.get("status") == "succeeded":
                output = data.get("output")
                result_url = _get_video_url(output)
                async with async_session() as session:
                    row = await session.get(Job, job_id)
                    if row:
                        row.status = "done"
                        row.result_url = result_url or ""
                        await session.commit()
            else:
                err = data.get("error") or "Unknown error"
                async with async_session() as session:
                    row = await session.get(Job, job_id)
                    if row:
                        row.status = "failed"
                        row.error_message = str(err)[:1024]
                        await session.commit()
    except Exception as e:
        async with async_session() as session:
            row = await session.get(Job, job_id)
            if row:
                row.status = "failed"
                row.error_message = str(e)[:1024]
                await session.commit()
