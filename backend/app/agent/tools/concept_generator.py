"""
Uses Claude to generate a viral YouTube Shorts concept.
Respects channel description (style_notes), avoids previously used topics,
and outputs a music_mood field for background music selection.
"""
import json
import anthropic

from app.config import settings


def generate_video_concept(
    channel_name: str,
    genre: str,
    style_notes: str = "",
    previous_topics: list[str] | None = None,
    idea_title: str | None = None,
    idea_notes: str | None = None,
) -> dict:
    """
    Generate a unique, viral YouTube Shorts concept.
    Returns:
        {
          "title": str,
          "description": str,
          "script": str,
          "image_prompts": [str, str, str, str],
          "tags": [str, ...],
          "music_mood": str   # upbeat | dramatic | calm | mysterious | energetic |
                              # inspirational | cheerful | tense
        }
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    system = (
        "You are an elite YouTube Shorts strategist with a track record of creating "
        "videos that reach 10M+ views. You understand viral psychology, trending "
        "formats, and platform algorithms deeply.\n\n"
        "VIRAL PRINCIPLES you always apply:\n"
        "1. Hook in the FIRST 3 WORDS — shock, curiosity gap, or bold claim\n"
        "2. Every second earns attention — zero filler, zero padding\n"
        "3. Emotional resonance — inspire, shock, delight, or validate the viewer\n"
        "4. Strong CTA at the end — subscribe, comment their answer, or share\n"
        "5. Power words in titles: numbers, 'secret', 'nobody talks about', "
        "'you need to know', 'this changed everything'\n"
        "6. Images must be visually striking, not generic stock-photo compositions\n"
        "7. Script length: exactly 30-45 seconds when read at a natural speaking pace"
    )

    avoid_block = ""
    if previous_topics:
        formatted = "\n".join(f"  • {t}" for t in previous_topics[-15:])
        avoid_block = (
            f"\n\nAVOID — these topics were already covered on this channel:\n"
            f"{formatted}\n"
            f"Pick a FRESH angle that is clearly different from all of the above.\n"
        )

    # When an idea is provided, use it as the creative directive
    idea_block = ""
    if idea_title:
        idea_block = (
            f"\n\nDIRECTIVE — build the entire concept around this specific idea:\n"
            f"  Title: {idea_title}\n"
        )
        if idea_notes:
            idea_block += f"  Notes: {idea_notes}\n"
        idea_block += (
            "Use the directive title as the video's title (you may refine wording slightly "
            "for maximum click-through) and ensure every element of the script, images, "
            "and music serves this specific idea.\n"
        )

    user_prompt = (
        f"Create a UNIQUE, VIRAL YouTube Shorts concept for:\n"
        f"• Channel name: {channel_name}\n"
        f"• Genre / category: {genre}\n"
        f"• Channel description & brand voice:\n"
        f"  {style_notes or 'No specific description — use best practices for this genre.'}\n"
        f"{avoid_block}"
        f"{idea_block}\n"
        f"The concept MUST:\n"
        f"- Be 100% aligned with the channel description above\n"
        f"- Open the script with a one-sentence hook that creates curiosity or "
        f"urgency within the first 3 seconds\n"
        f"- Use image prompts that are visually unique, dramatic, and on-brand\n"
        f"- Choose a music_mood that amplifies the emotional impact of the content\n\n"
        f"Return ONLY valid JSON (no markdown fences) with exactly these keys:\n"
        f'{{\n'
        f'  "title": "viral title under 60 chars — hook + power word",\n'
        f'  "description": "100-150 char YouTube description with emojis and hashtags",\n'
        f'  "script": "30-45 second voiceover — hook → value → CTA",\n'
        f'  "image_prompts": [\n'
        f'    "DALL-E prompt 1 — portrait 9:16, cinematic, high visual impact",\n'
        f'    "DALL-E prompt 2 — portrait 9:16, cinematic, high visual impact",\n'
        f'    "DALL-E prompt 3 — portrait 9:16, cinematic, high visual impact",\n'
        f'    "DALL-E prompt 4 — portrait 9:16, cinematic, high visual impact"\n'
        f'  ],\n'
        f'  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8"],\n'
        f'  "music_mood": "one of: upbeat | dramatic | calm | mysterious | energetic | '
        f'inspirational | cheerful | tense"\n'
        f'}}'
    )

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1500,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())
