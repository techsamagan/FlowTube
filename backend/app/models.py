import uuid
from sqlalchemy import String, DateTime, Text, Column, Integer, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    email = Column(String(256), unique=True, nullable=False, index=True)
    hashed_password = Column(String(256), nullable=False)
    is_verified = Column(Boolean, default=False)
    verification_code = Column(String(6), nullable=True)
    code_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    channels = relationship("Channel", back_populates="user", cascade="all, delete-orphan")


class Channel(Base):
    __tablename__ = "channels"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    name = Column(String(256), nullable=False)
    youtube_channel_id = Column(String(256), nullable=True)  # populated after OAuth
    genre = Column(String(128), nullable=False)
    style_notes = Column(Text, nullable=True)      # extra creative direction
    credentials_json = Column(Text, nullable=True)  # encrypted OAuth tokens
    connected = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="channels")

    videos = relationship("Video", back_populates="channel", cascade="all, delete-orphan")
    schedules = relationship("Schedule", back_populates="channel", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="channel", cascade="all, delete-orphan")
    ideas = relationship("VideoIdea", back_populates="channel", cascade="all, delete-orphan")


class Video(Base):
    __tablename__ = "videos"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    channel_id = Column(String(36), ForeignKey("channels.id"), nullable=False)
    title = Column(String(512), nullable=True)
    description = Column(Text, nullable=True)
    tags = Column(Text, nullable=True)          # comma-separated
    file_path = Column(String(1024), nullable=True)
    thumbnail_path = Column(String(1024), nullable=True)
    youtube_video_id = Column(String(256), nullable=True)
    status = Column(String(32), default="pending")  # pending/uploaded/failed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    channel = relationship("Channel", back_populates="videos")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    channel_id = Column(String(36), ForeignKey("channels.id"), nullable=True)
    # status: queued | running | preview | scheduled | uploading | done | failed | rejected
    status = Column(String(32), default="queued")
    current_step = Column(String(64), nullable=True)
    progress = Column(Integer, default=0)           # 0-100
    model = Column(String(32), default="anthropic") # anthropic | kling | sora | veo
    video_path = Column(String(512), nullable=True) # relative path under storage_dir
    scheduled_upload_at = Column(DateTime(timezone=True), nullable=True)
    result_data = Column(Text, nullable=True)        # JSON: {"title": "..."}
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    channel = relationship("Channel", back_populates="jobs")


class VideoIdea(Base):
    __tablename__ = "video_ideas"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    channel_id = Column(String(36), ForeignKey("channels.id"), nullable=False)
    title = Column(String(512), nullable=False)
    notes = Column(Text, nullable=True)          # extra context / talking points
    status = Column(String(32), default="pending")  # pending | in_progress | done | rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    channel = relationship("Channel", back_populates="ideas")


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    channel_id = Column(String(36), ForeignKey("channels.id"), nullable=False)
    cron_expression = Column(String(128), nullable=False)  # e.g. "0 9 * * *"
    is_active = Column(Boolean, default=True)
    next_run = Column(DateTime(timezone=True), nullable=True)
    last_run = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    channel = relationship("Channel", back_populates="schedules")
