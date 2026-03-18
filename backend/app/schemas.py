from datetime import datetime
from typing import Optional
from pydantic import BaseModel


# ── Channel ──────────────────────────────────────────────────────────────────

class ChannelCreate(BaseModel):
    name: str
    genre: str
    style_notes: Optional[str] = None


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    genre: Optional[str] = None
    style_notes: Optional[str] = None


class ChannelResponse(BaseModel):
    id: str
    name: str
    youtube_channel_id: Optional[str]
    genre: str
    style_notes: Optional[str]
    connected: bool
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── VideoIdea ─────────────────────────────────────────────────────────────────

class VideoIdeaCreate(BaseModel):
    title: str
    notes: Optional[str] = None


class VideoIdeaUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class VideoIdeaResponse(BaseModel):
    id: str
    channel_id: str
    title: str
    notes: Optional[str]
    status: str
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Video ─────────────────────────────────────────────────────────────────────

class VideoResponse(BaseModel):
    id: str
    channel_id: str
    title: Optional[str]
    description: Optional[str]
    tags: Optional[str]
    file_path: Optional[str]
    youtube_video_id: Optional[str]
    status: str
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Job ───────────────────────────────────────────────────────────────────────

class JobResponse(BaseModel):
    id: str
    channel_id: Optional[str]
    status: str
    current_step: Optional[str]
    progress: int
    model: Optional[str]
    video_path: Optional[str]
    scheduled_upload_at: Optional[datetime]
    result_data: Optional[str]
    error_message: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Schedule ──────────────────────────────────────────────────────────────────

class ScheduleCreate(BaseModel):
    cron_expression: str


class ScheduleResponse(BaseModel):
    id: str
    channel_id: str
    cron_expression: str
    is_active: bool
    next_run: Optional[datetime]
    last_run: Optional[datetime]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True
