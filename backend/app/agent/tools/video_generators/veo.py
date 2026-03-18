"""
Google Veo 2 text-to-video generation via Google AI Studio.
Requires: GOOGLE_AI_API_KEY with Veo access.
"""
import os
import time
import urllib.request

from app.config import settings


def generate_video(concept: dict, job_id: str) -> str:
    """
    Generate a video using Google's Veo 2 model.
    Returns local path to the downloaded MP4.
    """
    if not settings.google_ai_api_key:
        raise RuntimeError("Google AI API key not set. Add GOOGLE_AI_API_KEY to .env")

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise RuntimeError(
            "google-genai package not installed. Run: pip install google-genai"
        )

    client = genai.Client(api_key=settings.google_ai_api_key)

    prompt = (
        f"{concept.get('title', '')}. "
        f"{concept.get('script', '')[:800]}"
    )

    operation = client.models.generate_videos(
        model="veo-2.0-generate-001",
        prompt=prompt,
        config=types.GenerateVideoConfig(
            aspect_ratio="9:16",
            duration_seconds=8,
            number_of_videos=1,
        ),
    )

    # Poll until done (max 10 min)
    for _ in range(120):
        time.sleep(5)
        operation = client.operations.get(operation)
        if operation.done:
            break
    else:
        raise RuntimeError("Veo generation timed out")

    if operation.error:
        raise RuntimeError(f"Veo generation failed: {operation.error.message}")

    # Save video
    out_dir = os.path.join(settings.storage_dir, "videos", job_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "short.mp4")

    video = operation.response.generated_videos[0]
    client.files.download(file=video.video, download_path=out_path)
    return out_path
