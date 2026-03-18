import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Schedule
from app.schemas import ScheduleCreate, ScheduleResponse
from app.scheduler import add_channel_schedule, remove_channel_schedule

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


@router.get("/channel/{channel_id}", response_model=list[ScheduleResponse])
async def list_schedules(channel_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Schedule).where(Schedule.channel_id == channel_id)
    )
    return result.scalars().all()


@router.post("/channel/{channel_id}", response_model=ScheduleResponse)
async def create_schedule(
    channel_id: str,
    body: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
):
    schedule = Schedule(
        id=str(uuid.uuid4()),
        channel_id=channel_id,
        cron_expression=body.cron_expression,
        is_active=True,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    add_channel_schedule(schedule.id, channel_id, body.cron_expression)
    return schedule


@router.patch("/{schedule_id}/toggle", response_model=ScheduleResponse)
async def toggle_schedule(schedule_id: str, db: AsyncSession = Depends(get_db)):
    s = await db.get(Schedule, schedule_id)
    if not s:
        raise HTTPException(404, "Schedule not found")
    s.is_active = not s.is_active
    await db.commit()
    await db.refresh(s)
    if s.is_active:
        add_channel_schedule(s.id, s.channel_id, s.cron_expression)
    else:
        remove_channel_schedule(s.id)
    return s


@router.delete("/{schedule_id}")
async def delete_schedule(schedule_id: str, db: AsyncSession = Depends(get_db)):
    s = await db.get(Schedule, schedule_id)
    if not s:
        raise HTTPException(404, "Schedule not found")
    remove_channel_schedule(schedule_id)
    await db.delete(s)
    await db.commit()
    return {"ok": True}
