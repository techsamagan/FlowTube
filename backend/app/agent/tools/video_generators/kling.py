"""
Kling AI text-to-video generation.
API docs: https://klingai.com/docs
Auth: JWT signed with KLING_ACCESS_KEY + KLING_SECRET_KEY
"""
import os
import time
import hmac
import hashlib
import base64
import json
import urllib.request
import urllib.error

from app.config import settings


def _make_jwt() -> str:
    """Generate a short-lived JWT for Kling API authentication."""
    import time as t
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    now = int(t.time())
    payload = base64.urlsafe_b64encode(json.dumps({
        "iss": settings.kling_access_key,
        "exp": now + 1800,
        "nbf": now - 5,
    }).encode()).rstrip(b"=").decode()
    signing_input = f"{header}.{payload}".encode()
    sig = hmac.new(settings.kling_secret_key.encode(), signing_input, hashlib.sha256).digest()
    signature = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{header}.{payload}.{signature}"


def _api(method: str, path: str, body: dict | None = None) -> dict:
    url = f"https://api.klingai.com{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {_make_jwt()}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def generate_video(concept: dict, job_id: str) -> str:
    """
    Submit a Kling text-to-video task and poll until complete.
    Returns local path to the downloaded MP4.
    """
    if not settings.kling_access_key or not settings.kling_secret_key:
        raise RuntimeError("Kling credentials not set. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env")

    prompt = (
        f"{concept.get('title', '')}. "
        f"{concept.get('script', '')[:500]}"
    )

    resp = _api("POST", "/v1/videos/text2video", {
        "model": "kling-v1-6",
        "prompt": prompt,
        "duration": "10",
        "aspect_ratio": "9:16",
    })
    task_id = resp["data"]["task_id"]

    # Poll until complete (max 10 minutes)
    for _ in range(120):
        time.sleep(5)
        status_resp = _api("GET", f"/v1/videos/text2video/{task_id}")
        task = status_resp["data"]
        if task["task_status"] == "succeed":
            video_url = task["task_result"]["videos"][0]["url"]
            break
        if task["task_status"] == "failed":
            raise RuntimeError(f"Kling generation failed: {task.get('task_status_msg', '')}")
    else:
        raise RuntimeError("Kling generation timed out after 10 minutes")

    # Download video
    out_dir = os.path.join(settings.storage_dir, "videos", job_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "short.mp4")
    urllib.request.urlretrieve(video_url, out_path)
    return out_path
