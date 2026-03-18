"""
CRUD for per-channel video idea lists, plus AI-powered idea generation.
"""
import json
import uuid
from typing import Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models import VideoIdea, Channel
from app.schemas import VideoIdeaCreate, VideoIdeaUpdate, VideoIdeaResponse

router = APIRouter(prefix="/api/ideas", tags=["ideas"])


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/channel/{channel_id}", response_model=list[VideoIdeaResponse])
async def list_ideas(channel_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(VideoIdea)
        .where(VideoIdea.channel_id == channel_id)
        .order_by(VideoIdea.created_at.asc())
    )
    return result.scalars().all()


@router.post("/channel/{channel_id}", response_model=VideoIdeaResponse)
async def create_idea(
    channel_id: str,
    body: VideoIdeaCreate,
    db: AsyncSession = Depends(get_db),
):
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    idea = VideoIdea(id=str(uuid.uuid4()), channel_id=channel_id, **body.model_dump())
    db.add(idea)
    await db.commit()
    await db.refresh(idea)
    return idea


@router.patch("/{idea_id}", response_model=VideoIdeaResponse)
async def update_idea(
    idea_id: str,
    body: VideoIdeaUpdate,
    db: AsyncSession = Depends(get_db),
):
    idea = await db.get(VideoIdea, idea_id)
    if not idea:
        raise HTTPException(404, "Idea not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(idea, field, value)
    await db.commit()
    await db.refresh(idea)
    return idea


@router.delete("/{idea_id}")
async def delete_idea(idea_id: str, db: AsyncSession = Depends(get_db)):
    idea = await db.get(VideoIdea, idea_id)
    if not idea:
        raise HTTPException(404, "Idea not found")
    await db.delete(idea)
    await db.commit()
    return {"ok": True}


# ── AI generation ─────────────────────────────────────────────────────────────

class GenerateIdeasBody(BaseModel):
    count: Optional[int] = 10


@router.post("/channel/{channel_id}/generate", response_model=list[VideoIdeaResponse])
async def generate_ideas(
    channel_id: str,
    body: GenerateIdeasBody = GenerateIdeasBody(),
    db: AsyncSession = Depends(get_db),
):
    """Use Claude to generate a batch of fresh video ideas for this channel."""
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")

    # Fetch existing pending ideas so Claude doesn't duplicate them
    existing_result = await db.execute(
        select(VideoIdea)
        .where(VideoIdea.channel_id == channel_id, VideoIdea.status == "pending")
    )
    existing_titles = [i.title for i in existing_result.scalars().all()]

    count = max(1, min(body.count or 10, 20))
    avoid = ""
    if existing_titles:
        avoid = "\n\nDo NOT repeat these already-queued ideas:\n" + "\n".join(
            f"  • {t}" for t in existing_titles
        )

    prompt = (
        f"Generate exactly {count} unique, viral YouTube Shorts video ideas for:\n"
        f"• Channel: {ch.name}\n"
        f"• Genre: {ch.genre}\n"
        f"• Channel description: {ch.style_notes or 'General content in this genre'}\n"
        f"{avoid}\n\n"
        f"Each idea should:\n"
        f"- Have a compelling, clickable title (use numbers, questions, or power words)\n"
        f"- Include brief notes (1-2 sentences) about the angle, hook, or key points\n"
        f"- Be distinctly different from the others\n"
        f"- Align with the channel's brand and description\n\n"
        f"Return ONLY valid JSON array (no markdown), exactly {count} items:\n"
        f'[{{"title": "...", "notes": "..."}}, ...]'
    )

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    ideas_data: list[dict] = json.loads(raw.strip())

    created = []
    for item in ideas_data[:count]:
        title = str(item.get("title", "")).strip()
        notes = str(item.get("notes", "")).strip() or None
        if not title:
            continue
        idea = VideoIdea(
            id=str(uuid.uuid4()),
            channel_id=channel_id,
            title=title,
            notes=notes,
        )
        db.add(idea)
        created.append(idea)

    await db.commit()
    for idea in created:
        await db.refresh(idea)
    return created
