"""
Claude-powered agent that orchestrates YouTube Shorts generation.

Two pipelines depending on the chosen model:

  Anthropic (default):
    1. generate_video_concept  → title / script / image_prompts / music_mood
    2. generate_images         → DALL-E 3 portrait images
    3. generate_voiceover      → edge-tts MP3
    4. generate_music          → numpy background track
    5. assemble_video          → MoviePy MP4  ← job enters "preview" here

  Kling / Sora / Veo:
    1. generate_video_concept  → title / script / music_mood
    2. generate_video_with_model → full MP4 from the chosen AI model  ← preview

After preview the user approves/schedules; upload_to_youtube is called separately.
"""
import json
import asyncio
import os
import time
from typing import Any

import anthropic

from app.config import settings
from app.agent.tools.concept_generator import generate_video_concept
from app.agent.tools.image_generator import generate_images
from app.agent.tools.voice_generator import generate_voiceover
from app.agent.tools.music_generator import generate_music
from app.agent.tools.video_assembler import assemble_video
from app.agent.tools.video_generators import generate_with_model

# ── Shared tools ──────────────────────────────────────────────────────────────

_CONCEPT_TOOL = {
    "name": "generate_video_concept",
    "description": (
        "Generate a unique, viral YouTube Shorts concept aligned with the channel "
        "description. Pass previous_topics to ensure the video is fresh."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "channel_name": {"type": "string"},
            "genre": {"type": "string"},
            "style_notes": {"type": "string"},
            "previous_topics": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Already-used titles to avoid",
            },
            "idea_title": {
                "type": "string",
                "description": "Specific idea title to base the video on",
            },
            "idea_notes": {
                "type": "string",
                "description": "Extra notes / talking points for the idea",
            },
        },
        "required": ["channel_name", "genre"],
    },
}

# ── Anthropic-pipeline tools ───────────────────────────────────────────────────

TOOLS_ANTHROPIC = [
    _CONCEPT_TOOL,
    {
        "name": "generate_images",
        "description": "Generate portrait 9:16 images with DALL-E 3.",
        "input_schema": {
            "type": "object",
            "properties": {
                "prompts": {"type": "array", "items": {"type": "string"}},
                "job_id": {"type": "string"},
            },
            "required": ["prompts", "job_id"],
        },
    },
    {
        "name": "generate_voiceover",
        "description": "Generate MP3 voiceover from a script using edge-tts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "script": {"type": "string"},
                "job_id": {"type": "string"},
                "voice": {
                    "type": "string",
                    "enum": ["default", "female", "male", "energetic", "calm"],
                },
            },
            "required": ["script", "job_id"],
        },
    },
    {
        "name": "generate_music",
        "description": "Generate background music for the video mood.",
        "input_schema": {
            "type": "object",
            "properties": {
                "mood": {"type": "string"},
                "duration": {"type": "number"},
                "job_id": {"type": "string"},
            },
            "required": ["mood", "duration", "job_id"],
        },
    },
    {
        "name": "assemble_video",
        "description": "Combine images + voiceover + music into a 1080×1920 MP4.",
        "input_schema": {
            "type": "object",
            "properties": {
                "image_paths": {"type": "array", "items": {"type": "string"}},
                "audio_path": {"type": "string"},
                "music_path": {"type": "string"},
                "title": {"type": "string"},
                "job_id": {"type": "string"},
            },
            "required": ["image_paths", "audio_path", "title", "job_id"],
        },
    },
]

# ── Model-specific (Kling / Sora / Veo) tools ─────────────────────────────────

TOOLS_MODEL = [
    _CONCEPT_TOOL,
    {
        "name": "generate_video_with_model",
        "description": (
            "Generate a complete video using the AI video model (Kling / Sora / Veo). "
            "Pass the full concept dict. Returns the local MP4 path."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "concept": {
                    "type": "object",
                    "description": "The full concept dict from generate_video_concept",
                },
                "job_id": {"type": "string"},
            },
            "required": ["concept", "job_id"],
        },
    },
]

# ── Progress ranges ────────────────────────────────────────────────────────────

STEP_PROGRESS_ANTHROPIC = {
    "generate_video_concept": (5, 15),
    "generate_images": (15, 45),
    "generate_voiceover": (45, 60),
    "generate_music": (60, 68),
    "assemble_video": (68, 95),
}

STEP_PROGRESS_MODEL = {
    "generate_video_concept": (5, 15),
    "generate_video_with_model": (15, 95),
}


# ── Tool executor ─────────────────────────────────────────────────────────────

def _execute_tool(name: str, inputs: dict, model: str) -> Any:
    if name == "generate_video_concept":
        return generate_video_concept(
            channel_name=inputs["channel_name"],
            genre=inputs["genre"],
            style_notes=inputs.get("style_notes", ""),
            previous_topics=inputs.get("previous_topics"),
            idea_title=inputs.get("idea_title"),
            idea_notes=inputs.get("idea_notes"),
        )
    elif name == "generate_images":
        return generate_images(prompts=inputs["prompts"], job_id=inputs["job_id"])
    elif name == "generate_voiceover":
        return generate_voiceover(
            script=inputs["script"],
            job_id=inputs["job_id"],
            voice=inputs.get("voice", "default"),
        )
    elif name == "generate_music":
        return generate_music(
            mood_or_genre=inputs["mood"],
            duration=float(inputs["duration"]),
            job_id=inputs["job_id"],
        )
    elif name == "assemble_video":
        return assemble_video(
            image_paths=inputs["image_paths"],
            audio_path=inputs["audio_path"],
            title=inputs["title"],
            job_id=inputs["job_id"],
            music_path=inputs.get("music_path"),
        )
    elif name == "generate_video_with_model":
        return generate_with_model(
            model=model,
            concept=inputs["concept"],
            job_id=inputs["job_id"],
        )
    else:
        raise ValueError(f"Unknown tool: {name}")


# ── Main agent runner ─────────────────────────────────────────────────────────

async def run_agent(
    job_id: str,
    channel_name: str,
    genre: str,
    style_notes: str,
    on_progress,
    model: str = "anthropic",
    previous_topics: list[str] | None = None,
    idea_title: str | None = None,
    idea_notes: str | None = None,
) -> tuple[str | None, str | None]:
    """
    Run the generation pipeline.
    Returns (generated_title, relative_video_path).
    Does NOT upload — caller handles upload after user approval.
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    is_anthropic = model == "anthropic"
    tools = TOOLS_ANTHROPIC if is_anthropic else TOOLS_MODEL
    step_progress = STEP_PROGRESS_ANTHROPIC if is_anthropic else STEP_PROGRESS_MODEL

    prev_block = ""
    if previous_topics:
        formatted = ", ".join(f'"{t}"' for t in previous_topics[:15])
        prev_block = f"\n- Already-used titles (avoid): [{formatted}]"

    idea_block = ""
    if idea_title:
        idea_block = f"\n- IDEA TO USE: \"{idea_title}\""
        if idea_notes:
            idea_block += f"\n- Idea notes: {idea_notes}"

    if is_anthropic:
        pipeline_steps = (
            "1. generate_video_concept (pass style_notes + previous_topics)\n"
            "2. generate_images (use image_prompts)\n"
            "3. generate_voiceover (match voice to music_mood)\n"
            "4. generate_music (use music_mood + voiceover duration)\n"
            "5. assemble_video (pass image_paths + audio_path + music_path)\n"
            "STOP after step 5. Do NOT upload."
        )
    else:
        pipeline_steps = (
            "1. generate_video_concept (pass style_notes + previous_topics)\n"
            f"2. generate_video_with_model (pass the full concept dict; model={model})\n"
            "STOP after step 2. Do NOT upload."
        )

    system_prompt = (
        "You are an autonomous YouTube Shorts creator.\n\n"
        f"PIPELINE:\n{pipeline_steps}\n\n"
        "The channel description (style_notes) is the brand bible — "
        "every creative decision must stay on-brand.\n"
        "VIRAL PRINCIPLES: hook in first 3 words, no filler, strong CTA.\n\n"
        "IMAGE PROMPTS: must be safe for all audiences. No violence, blood, weapons, "
        "nudity, drugs, or disturbing content. Use vivid visual descriptions: "
        "colors, lighting, composition, style (e.g. cinematic, digital art, illustration)."
    )

    messages = [
        {
            "role": "user",
            "content": (
                f"Generate a YouTube Short for:\n"
                f"- Channel: {channel_name}\n"
                f"- Genre: {genre}\n"
                f"- Description: {style_notes or 'none'}"
                f"{prev_block}"
                f"{idea_block}\n"
                f"- Job ID (use in ALL tool calls): {job_id}\n\n"
                f"Execute the pipeline now and stop before uploading."
                + (f"\nIMPORTANT: pass idea_title={idea_title!r} and idea_notes={idea_notes!r} "
                   f"to generate_video_concept." if idea_title else "")
            ),
        }
    ]

    generated_title: str | None = None
    video_path: str | None = None

    while True:
        for attempt in range(5):
            try:
                response = client.messages.create(
                    model="claude-opus-4-6",
                    max_tokens=4096,
                    thinking={"type": "adaptive"},
                    tools=tools,
                    system=system_prompt,
                    messages=messages,
                )
                break
            except anthropic.APIStatusError as e:
                if e.status_code == 529 and attempt < 4:
                    wait = 2 ** attempt * 5  # 5, 10, 20, 40 seconds
                    await asyncio.sleep(wait)
                else:
                    raise

        if response.stop_reason in ("end_turn", None) or response.stop_reason != "tool_use":
            break

        tool_uses = [b for b in response.content if b.type == "tool_use"]
        messages.append({"role": "assistant", "content": response.content})

        tool_results = []
        for tool_use in tool_uses:
            tool_name = tool_use.name
            tool_input = tool_use.input

            start_pct, _ = step_progress.get(tool_name, (0, 0))
            await on_progress(tool_name, start_pct)

            try:
                result = await asyncio.to_thread(_execute_tool, tool_name, tool_input, model)
            except Exception as e:
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "is_error": True,
                    "content": str(e),
                })
                raise

            result_str = json.dumps(result) if not isinstance(result, str) else result

            # Capture title and video path
            if tool_name == "generate_video_concept":
                try:
                    d = result if isinstance(result, dict) else json.loads(result_str)
                    generated_title = d.get("title")
                except Exception:
                    pass
            elif tool_name in ("assemble_video", "generate_video_with_model"):
                raw_path = result if isinstance(result, str) else result_str.strip('"')
                # Store relative path (strip storage_dir prefix)
                storage = os.path.abspath(settings.storage_dir)
                abs_path = os.path.abspath(raw_path)
                try:
                    video_path = os.path.relpath(abs_path, storage)
                except ValueError:
                    video_path = raw_path

            _, end_pct = step_progress.get(tool_name, (0, 100))
            await on_progress(tool_name, end_pct)

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result_str,
            })

        messages.append({"role": "user", "content": tool_results})

    return generated_title, video_path


# ── Upload step (called after user approval) ──────────────────────────────────

def upload_video(
    video_path: str,      # absolute or relative to storage_dir
    title: str,
    description: str,
    tags: list[str],
    credentials_json_encrypted: str,
) -> str:
    """Upload the preview video to YouTube. Returns YouTube video ID."""
    from app.agent.tools.youtube_uploader import upload_to_youtube
    import os
    # Resolve to absolute path
    if not os.path.isabs(video_path):
        video_path = os.path.join(settings.storage_dir, video_path)
    return upload_to_youtube(
        video_path=video_path,
        title=title,
        description=description,
        tags=tags,
        credentials_json_encrypted=credentials_json_encrypted,
    )
