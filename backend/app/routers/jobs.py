import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db, async_session
from app.models import Job, Channel, VideoIdea
from app.schemas import JobResponse
from app.agent.agent import run_agent, upload_video

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_previous_topics(channel_id: str, limit: int = 20) -> list[str]:
    async with async_session() as db:
        result = await db.execute(
            select(Job)
            .where(Job.channel_id == channel_id, Job.status.in_(["done", "preview", "scheduled"]),
                   Job.result_data.isnot(None))
            .order_by(Job.created_at.desc())
            .limit(limit)
        )
        jobs = result.scalars().all()
    titles = []
    for job in jobs:
        try:
            data = json.loads(job.result_data)
            if data.get("title"):
                titles.append(data["title"])
        except Exception:
            pass
    return titles


# ── Background tasks ──────────────────────────────────────────────────────────

async def _run_generation(job_id: str, channel_id: str, model: str, idea_id: str | None = None):
    """Generate the video and park it at 'preview' status."""
    async with async_session() as db:
        channel = await db.get(Channel, channel_id)
        if not channel:
            async with async_session() as s:
                job = await s.get(Job, job_id)
                if job:
                    job.status = "failed"
                    job.error_message = "Channel not found"
                    await s.commit()
            return
        channel_name = channel.name
        genre = channel.genre
        style_notes = channel.style_notes or ""

        # Load idea if provided, else pick the next pending one
        idea_title: str | None = None
        idea_notes: str | None = None
        resolved_idea_id: str | None = idea_id

        if idea_id:
            idea = await db.get(VideoIdea, idea_id)
            if idea:
                idea_title = idea.title
                idea_notes = idea.notes
                idea.status = "in_progress"
                await db.commit()
        else:
            # Auto-pick the oldest pending idea for this channel
            result = await db.execute(
                select(VideoIdea)
                .where(VideoIdea.channel_id == channel_id, VideoIdea.status == "pending")
                .order_by(VideoIdea.created_at.asc())
                .limit(1)
            )
            next_idea = result.scalars().first()
            if next_idea:
                idea_title = next_idea.title
                idea_notes = next_idea.notes
                resolved_idea_id = next_idea.id
                next_idea.status = "in_progress"
                await db.commit()

    previous_topics = await _get_previous_topics(channel_id)

    async def on_progress(step: str, pct: int):
        async with async_session() as s:
            job = await s.get(Job, job_id)
            if job:
                job.current_step = step
                job.progress = pct
                await s.commit()

    async with async_session() as s:
        job = await s.get(Job, job_id)
        if job:
            job.status = "running"
            await s.commit()

    try:
        title, video_path = await run_agent(
            job_id=job_id,
            channel_name=channel_name,
            genre=genre,
            style_notes=style_notes,
            on_progress=on_progress,
            model=model,
            previous_topics=previous_topics,
            idea_title=idea_title,
            idea_notes=idea_notes,
        )
        async with async_session() as s:
            job = await s.get(Job, job_id)
            if job:
                job.status = "preview"
                job.progress = 95
                job.video_path = video_path
                if title:
                    job.result_data = json.dumps({"title": title})
                await s.commit()
            # Mark idea as done (preview reached = video exists)
            if resolved_idea_id:
                idea = await s.get(VideoIdea, resolved_idea_id)
                if idea:
                    idea.status = "done"
                    await s.commit()
    except Exception as e:
        async with async_session() as s:
            job = await s.get(Job, job_id)
            if job:
                job.status = "failed"
                job.error_message = str(e)[:2000]
                await s.commit()
            # Revert idea back to pending so it can be retried
            if resolved_idea_id:
                idea = await s.get(VideoIdea, resolved_idea_id)
                if idea and idea.status == "in_progress":
                    idea.status = "pending"
                    await s.commit()


async def _run_upload(job_id: str, channel_id: str):
    """Upload the preview video to YouTube."""
    async with async_session() as db:
        job = await db.get(Job, job_id)
        channel = await db.get(Channel, channel_id)
        if not job or not channel:
            return
        video_path = job.video_path
        creds = channel.credentials_json or ""
        title = ""
        description = ""
        tags: list[str] = []
        try:
            data = json.loads(job.result_data or "{}")
            title = data.get("title", channel.name)
            description = data.get("description", "")
            tags = data.get("tags", [])
        except Exception:
            title = channel.name

    async def on_progress(step: str, pct: int):
        async with async_session() as s:
            j = await s.get(Job, job_id)
            if j:
                j.current_step = step
                j.progress = pct
                await s.commit()

    async with async_session() as s:
        j = await s.get(Job, job_id)
        if j:
            j.status = "uploading"
            j.current_step = "upload_to_youtube"
            j.progress = 96
            await s.commit()

    try:
        await on_progress("upload_to_youtube", 96)
        yt_id = await asyncio.to_thread(
            upload_video,
            video_path,
            title,
            description,
            tags,
            creds,
        )
        async with async_session() as s:
            j = await s.get(Job, job_id)
            if j:
                j.status = "done"
                j.progress = 100
                j.current_step = "upload_to_youtube"
                # Store yt_id in result_data
                try:
                    data = json.loads(j.result_data or "{}")
                except Exception:
                    data = {}
                data["youtube_video_id"] = yt_id
                j.result_data = json.dumps(data)
                await s.commit()
    except Exception as e:
        async with async_session() as s:
            j = await s.get(Job, job_id)
            if j:
                j.status = "failed"
                j.error_message = str(e)[:2000]
                await s.commit()


# ── Endpoints ─────────────────────────────────────────────────────────────────

class TriggerBody(BaseModel):
    model: Optional[str] = "anthropic"  # anthropic | kling | sora | veo
    idea_id: Optional[str] = None       # specific idea to use; omit to auto-pick next pending


@router.post("/trigger/{channel_id}", response_model=JobResponse)
async def trigger_job(
    channel_id: str,
    body: TriggerBody = TriggerBody(),
    db: AsyncSession = Depends(get_db),
):
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")

    allowed = {"anthropic", "kling", "sora", "veo"}
    model = body.model if body.model in allowed else "anthropic"

    job = Job(
        id=str(uuid.uuid4()),
        channel_id=channel_id,
        status="queued",
        progress=0,
        model=model,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    asyncio.create_task(_run_generation(job.id, channel_id, model, body.idea_id))
    return job


class ScheduleBody(BaseModel):
    upload_at: datetime  # ISO 8601


@router.post("/{job_id}/approve", response_model=JobResponse)
async def approve_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Approve a preview video and upload it immediately."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "preview":
        raise HTTPException(400, f"Job is '{job.status}', expected 'preview'")
    if not job.channel_id:
        raise HTTPException(400, "Job has no channel")

    asyncio.create_task(_run_upload(job_id, job.channel_id))
    return job


@router.post("/{job_id}/schedule", response_model=JobResponse)
async def schedule_job(
    job_id: str,
    body: ScheduleBody,
    db: AsyncSession = Depends(get_db),
):
    """Approve a preview video and schedule it for upload at a specific time."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "preview":
        raise HTTPException(400, f"Job is '{job.status}', expected 'preview'")

    upload_at = body.upload_at
    if upload_at.tzinfo is None:
        upload_at = upload_at.replace(tzinfo=timezone.utc)

    job.status = "scheduled"
    job.scheduled_upload_at = upload_at
    await db.commit()
    await db.refresh(job)

    # Register with APScheduler
    from app.scheduler import scheduler
    run_date = upload_at
    scheduler.add_job(
        _fire_scheduled_upload,
        trigger="date",
        run_date=run_date,
        args=[job_id, job.channel_id],
        id=f"upload_{job_id}",
        replace_existing=True,
    )
    return job


@router.post("/{job_id}/reject", response_model=JobResponse)
async def reject_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Reject the preview video."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "preview":
        raise HTTPException(400, f"Job is '{job.status}', expected 'preview'")
    job.status = "rejected"
    await db.commit()
    await db.refresh(job)
    return job


def _fire_scheduled_upload(job_id: str, channel_id: str):
    """APScheduler sync callback — creates async task for upload."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    loop.run_until_complete(_run_upload(job_id, channel_id))


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/channel/{channel_id}", response_model=list[JobResponse])
async def list_channel_jobs(channel_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Job)
        .where(Job.channel_id == channel_id)
        .order_by(Job.created_at.desc())
        .limit(20)
    )
    return result.scalars().all()
