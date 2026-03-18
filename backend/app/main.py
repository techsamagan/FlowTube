from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.database import init_db
from app.scheduler import scheduler, restore_schedules_from_db
from app.routers import channels, jobs, auth, schedules, ideas, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    scheduler.start()
    await restore_schedules_from_db()
    yield
    scheduler.shutdown()


app = FastAPI(title="YouTube Channel Manager", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(channels.router)
app.include_router(jobs.router)
app.include_router(auth.router)
app.include_router(schedules.router)
app.include_router(ideas.router)

# Serve generated videos
storage_dir = os.path.abspath("./storage")
os.makedirs(storage_dir, exist_ok=True)
app.mount("/storage", StaticFiles(directory=storage_dir), name="storage")


@app.exception_handler(Exception)
async def unhandled(request, exc):
    from fastapi.responses import JSONResponse
    if isinstance(exc, HTTPException):
        raise exc
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/api/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
