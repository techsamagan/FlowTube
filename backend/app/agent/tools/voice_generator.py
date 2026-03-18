"""Generate voiceover audio using edge-tts (free Microsoft TTS)."""
import asyncio
import os

import edge_tts

from app.config import settings

# Good voices for YouTube Shorts
VOICES = {
    "default": "en-US-AndrewNeural",
    "female": "en-US-JennyNeural",
    "male": "en-US-AndrewNeural",
    "energetic": "en-US-GuyNeural",
    "calm": "en-US-AriaNeural",
}


def generate_voiceover(script: str, job_id: str, voice: str = "default") -> str:
    """
    Generate MP3 voiceover from script text.
    Returns path to the saved audio file.
    """
    out_dir = os.path.join(settings.storage_dir, "audio", job_id)
    os.makedirs(out_dir, exist_ok=True)
    audio_path = os.path.join(out_dir, "voiceover.mp3")

    voice_name = VOICES.get(voice, VOICES["default"])

    async def _generate():
        communicate = edge_tts.Communicate(script, voice_name)
        await communicate.save(audio_path)

    asyncio.run(_generate())
    return audio_path
