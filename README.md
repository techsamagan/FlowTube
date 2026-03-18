# Text to Video (v0)

One prompt → one short video clip (4–8s) via a hosted text-to-video model → download MP4.

- **Stack:** React (Vite) frontend, FastAPI backend, SQLite jobs table, **free hosted video generator** (Replicate “Try for Free” — **minimax/video-01**, no payment required for limited runs).

## Setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# Set REPLICATE_API_TOKEN in .env — free at https://replicate.com/account/api-tokens (Try for Free = no credit card)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Enter a prompt (e.g. “A dog surfing on a wave, cinematic”), click **Generate**, wait for “Generating…” then use the video player and **Download video**.

## Flow

1. **Create job** – `POST /jobs` with `{ "prompt": "…" }` → job id, status `queued`.
2. **Background worker** – Marks job `running`, calls Replicate, polls until done/failed, writes `result_url` or `error_message`.
3. **Frontend** – Polls `GET /jobs/{id}` every 2s until `done` or `failed`, then shows video + download or error.
4. **Database** – `jobs` table: id, prompt, status, provider_job_id, result_url, error_message, created_at.

## Later (not in v0)

Multiple scenes, style presets, voiceover/captions, stitching, user accounts/credits, multiple providers/fallback.
