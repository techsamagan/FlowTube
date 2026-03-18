"""
OpenAI Sora text-to-video generation.
Uses the OpenAI video generation API.
Requires: OPENAI_API_KEY with Sora access.
"""
import os
import time
import urllib.request

from app.config import settings


def generate_video(concept: dict, job_id: str) -> str:
    """
    Generate a video using OpenAI's Sora model.
    Returns local path to the downloaded MP4.
    """
    if not settings.openai_api_key:
        raise RuntimeError("OpenAI API key not set. Add OPENAI_API_KEY to .env")

    import openai
    client = openai.OpenAI(api_key=settings.openai_api_key)

    prompt = (
        f"{concept.get('title', '')}. "
        f"{concept.get('script', '')[:800]}"
    )

    # Submit generation request
    response = client.videos.generate(
        model="sora",
        prompt=prompt,
        n=1,
        size="1080x1920",   # portrait 9:16
        duration=10,
    )

    # Poll for completion
    video_id = response.id
    for _ in range(120):
        time.sleep(5)
        result = client.videos.retrieve(video_id)
        if result.status == "completed":
            video_url = result.data[0].url
            break
        if result.status == "failed":
            raise RuntimeError(f"Sora generation failed: {result.error}")
    else:
        raise RuntimeError("Sora generation timed out")

    # Download video
    out_dir = os.path.join(settings.storage_dir, "videos", job_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "short.mp4")
    urllib.request.urlretrieve(video_url, out_path)
    return out_path
