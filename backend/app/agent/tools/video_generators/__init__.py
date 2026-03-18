"""
Dispatcher for model-specific video generators.
Each generator takes a concept dict and job_id, returns a local MP4 path.
"""
from __future__ import annotations


def generate_with_model(model: str, concept: dict, job_id: str) -> str:
    """
    Generate a video using the specified model.
    model: 'kling' | 'sora' | 'veo'
    Returns local path to the generated MP4.
    """
    if model == "kling":
        from .kling import generate_video
        return generate_video(concept, job_id)
    elif model == "sora":
        from .sora import generate_video
        return generate_video(concept, job_id)
    elif model == "veo":
        from .veo import generate_video
        return generate_video(concept, job_id)
    else:
        raise ValueError(f"Unknown model '{model}' — use 'kling', 'sora', or 'veo'")
