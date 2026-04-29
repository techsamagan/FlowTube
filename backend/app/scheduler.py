"""APScheduler wrapper — manages per-channel cron schedules."""
import asyncio
import uuid
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()


def _cron_parts(expr: str):
    parts = expr.strip().split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression: {expr!r}")
    minute, hour, day, month, day_of_week = parts
    return dict(
        minute=minute, hour=hour, day=day, month=month, day_of_week=day_of_week
    )


def add_channel_schedule(schedule_id: str, channel_id: str, cron_expression: str):
    """Add or replace a cron job that triggers video generation for a channel."""

    async def _fire():
        from app.database import async_session
        from app.models import Job, Schedule, Channel
        from app.routers.jobs import _run_generation, _run_upload
        from datetime import datetime, timezone

        # Create a job record
        async with async_session() as db:
            channel = await db.get(Channel, channel_id)
            if not channel:
                return
            job = Job(
                id=str(uuid.uuid4()),
                channel_id=channel_id,
                status="queued",
                progress=0,
            )
            db.add(job)
            await db.commit()
            await db.refresh(job)
            job_id = job.id
            has_creds = bool(channel.connected and channel.credentials_json)

        # Generate (parks at 'preview' on success)
        await _run_generation(job_id, channel_id, "anthropic")

        # Auto-upload if the channel is connected
        if has_creds:
            async with async_session() as db:
                j = await db.get(Job, job_id)
                if j and j.status == "preview":
                    await _run_upload(job_id, channel_id)

        # Update last_run regardless of outcome
        async with async_session() as db:
            sched = await db.get(Schedule, schedule_id)
            if sched:
                sched.last_run = datetime.now(timezone.utc)
                await db.commit()

    try:
        parts = _cron_parts(cron_expression)
    except ValueError:
        return

    if scheduler.get_job(schedule_id):
        scheduler.remove_job(schedule_id)

    scheduler.add_job(
        _fire,
        CronTrigger(**parts),
        id=schedule_id,
        replace_existing=True,
    )


def remove_channel_schedule(schedule_id: str):
    if scheduler.get_job(schedule_id):
        scheduler.remove_job(schedule_id)


async def restore_schedules_from_db():
    """Called at startup to re-register all active schedules."""
    from app.database import async_session
    from app.models import Schedule
    from sqlalchemy import select

    async with async_session() as db:
        result = await db.execute(select(Schedule).where(Schedule.is_active == True))
        schedules = result.scalars().all()

    for s in schedules:
        add_channel_schedule(s.id, s.channel_id, s.cron_expression)
