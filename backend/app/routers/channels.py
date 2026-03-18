import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from app.database import get_db
from app.models import Channel, User
from app.schemas import ChannelCreate, ChannelUpdate, ChannelResponse
from app.crypto import decrypt_token
from app.config import settings
from app.routers.users import get_current_user

router = APIRouter(prefix="/api/channels", tags=["channels"])


def _build_youtube(ch: Channel):
    creds_dict = json.loads(decrypt_token(ch.credentials_json))
    creds = Credentials(
        token=creds_dict.get("token"),
        refresh_token=creds_dict.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=creds_dict.get("scopes", []),
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return build("youtube", "v3", credentials=creds)


@router.get("", response_model=list[ChannelResponse])
async def list_channels(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Channel)
        .where(Channel.user_id == current_user.id)
        .order_by(Channel.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=ChannelResponse)
async def create_channel(
    body: ChannelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channel = Channel(id=str(uuid.uuid4()), user_id=current_user.id, **body.model_dump())
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return channel


@router.get("/{channel_id}", response_model=ChannelResponse)
async def get_channel(channel_id: str, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    return ch


@router.get("/{channel_id}/stats")
async def get_channel_stats(channel_id: str, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    if not ch.connected or not ch.credentials_json:
        raise HTTPException(400, "Channel not connected")

    youtube = _build_youtube(ch)
    resp = youtube.channels().list(part="statistics,snippet", mine=True).execute()
    if not resp.get("items"):
        raise HTTPException(404, "YouTube channel not found")

    item = resp["items"][0]
    stats = item.get("statistics", {})
    snippet = item.get("snippet", {})
    thumbnails = snippet.get("thumbnails", {})
    thumb_url = (
        thumbnails.get("medium", thumbnails.get("default", {})).get("url", "")
    )
    return {
        "subscriber_count": int(stats.get("subscriberCount", 0)),
        "view_count": int(stats.get("viewCount", 0)),
        "video_count": int(stats.get("videoCount", 0)),
        "title": snippet.get("title", ""),
        "thumbnail_url": thumb_url,
    }


@router.get("/{channel_id}/yt-videos")
async def get_channel_yt_videos(channel_id: str, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    if not ch.connected or not ch.credentials_json:
        raise HTTPException(400, "Channel not connected")

    youtube = _build_youtube(ch)

    # Get the uploads playlist ID for this channel
    ch_resp = youtube.channels().list(part="contentDetails", mine=True).execute()
    if not ch_resp.get("items"):
        return []
    uploads_id = (
        ch_resp["items"][0]
        .get("contentDetails", {})
        .get("relatedPlaylists", {})
        .get("uploads", "")
    )
    if not uploads_id:
        return []

    pl_resp = youtube.playlistItems().list(
        part="snippet,contentDetails",
        playlistId=uploads_id,
        maxResults=20,
    ).execute()

    videos = []
    for item in pl_resp.get("items", []):
        snippet = item.get("snippet", {})
        vid_id = item.get("contentDetails", {}).get("videoId", "")
        thumbnails = snippet.get("thumbnails", {})
        thumb = thumbnails.get("medium", thumbnails.get("default", {})).get("url", "")
        videos.append({
            "id": vid_id,
            "title": snippet.get("title", ""),
            "published_at": snippet.get("publishedAt", ""),
            "thumbnail_url": thumb,
            "url": f"https://youtube.com/watch?v={vid_id}",
        })
    return videos


@router.patch("/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    channel_id: str, body: ChannelUpdate, db: AsyncSession = Depends(get_db)
):
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(ch, field, value)
    await db.commit()
    await db.refresh(ch)
    return ch


@router.delete("/{channel_id}")
async def delete_channel(channel_id: str, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    await db.delete(ch)
    await db.commit()
    return {"ok": True}
