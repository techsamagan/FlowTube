"""Generate portrait images with DALL-E 3 (1024×1792 — 9:16 for Shorts)."""
import os
import httpx
from openai import OpenAI, BadRequestError

from app.config import settings

# Words that commonly trigger DALL-E content filters
_BLOCKED_TERMS = [
    "blood", "gore", "dead", "death", "kill", "corpse", "naked", "nude",
    "violent", "violence", "weapon", "gun", "knife", "bomb", "explosion",
    "terror", "drug", "cannabis", "cocaine", "racist", "hate",
]


def _sanitize_prompt(prompt: str) -> str:
    """Strip known trigger words and keep it safe & visual."""
    cleaned = prompt
    for term in _BLOCKED_TERMS:
        cleaned = cleaned.replace(term, "").replace(term.capitalize(), "")
    # Append a safety suffix so DALL-E stays in safe territory
    return cleaned.strip() + ", digital art, safe for all audiences, vibrant colors"


def _generate_one(client: OpenAI, prompt: str, index: int, out_dir: str) -> str:
    path = os.path.join(out_dir, f"image_{index:02d}.png")

    attempts = [prompt, _sanitize_prompt(prompt)]
    last_err = None
    for attempt_prompt in attempts:
        try:
            response = client.images.generate(
                model="dall-e-3",
                prompt=attempt_prompt,
                size="1024x1792",
                quality="standard",
                n=1,
            )
            url = response.data[0].url
            img_bytes = httpx.get(url, timeout=60).content
            with open(path, "wb") as f:
                f.write(img_bytes)
            return path
        except BadRequestError as e:
            if "content_policy_violation" in str(e) or "content filters" in str(e).lower():
                last_err = e
                continue
            raise

    # Final fallback: minimal safe prompt derived from the first few words
    safe_words = " ".join(w for w in prompt.split()[:6] if w.lower() not in _BLOCKED_TERMS)
    fallback = f"{safe_words}, cinematic portrait, vibrant, digital illustration"
    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=fallback,
            size="1024x1792",
            quality="standard",
            n=1,
        )
        url = response.data[0].url
        img_bytes = httpx.get(url, timeout=60).content
        with open(path, "wb") as f:
            f.write(img_bytes)
        return path
    except Exception:
        raise last_err


def generate_images(prompts: list[str], job_id: str) -> list[str]:
    """
    Generate images from prompts using DALL-E 3.
    Saves PNGs to storage/images/{job_id}/ and returns the file paths.
    """
    client = OpenAI(api_key=settings.openai_api_key)
    out_dir = os.path.join(settings.storage_dir, "images", job_id)
    os.makedirs(out_dir, exist_ok=True)

    return [_generate_one(client, prompt, i, out_dir) for i, prompt in enumerate(prompts)]
