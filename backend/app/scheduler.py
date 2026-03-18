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
    from app.database import async_session
    from app.models import Job, Schedule
    from app.agent.agent import run_agent
    from app.models import Channel

    async def _fire():
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
            creds = channel.credentials_json or ""

        async def on_progress(step, pct):
            async with async_session() as s:
                j = await s.get(Job, job_id)
                if j:
                    j.current_step = step
                    j.progress = pct
                    await s.commit()

        async with async_session() as s:
            j = await s.get(Job, job_id)
            if j:
                j.status = "running"
                await s.commit()

        try:
            await run_agent(
                job_id=job_id,
                channel_name=channel.name,
                genre=channel.genre,
                style_notes=channel.style_notes or "",
                credentials_json_encrypted=creds,
                on_progress=on_progress,
            )
            async with async_session() as s:
                j = await s.get(Job, job_id)
                if j:
                    j.status = "done"
                    j.progress = 100
                    await s.commit()

            # Update last_run
            async with async_session() as s:
                from datetime import datetime, timezone
                sched = await s.get(Schedule, schedule_id)
                if sched:
                    sched.last_run = datetime.now(timezone.utc)
                    await s.commit()
        except Exception as e:
            async with async_session() as s:
                j = await s.get(Job, job_id)
                if j:
                    j.status = "failed"
                    j.error_message = str(e)[:2000]
                    await s.commit()

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
