# Deploying FlowTube

**Backend → Render (Docker).  Frontend → Vercel.  DB → Supabase (already cloud).**

The backend is not a normal Node app: it runs **FFmpeg** (video assembly) and
**edge-tts** (free neural voiceover) and does **minutes-long render jobs**.
The Dockerfile installs both. Plan accordingly (see Caveats).

---

## 1. Backend on Render

1. Push this repo to GitHub (Render deploys from it).
2. Render → **New → Blueprint** → pick this repo. It reads `render.yaml`
   (service `flowtube-backend`, Docker, `dockerContext: ./backend`).
3. Set the secret env vars (Render dashboard → the service → Environment).
   `render.yaml` lists them all as `sync:false`:

   | Var | Value |
   |---|---|
   | `DATABASE_URL` | Supabase **pooled** URI — host `aws-0-<region>.pooler.supabase.com`, **port 6543**, `?pgbouncer=true&connection_limit=1`. NOT `db.<ref>.supabase.co` (that direct host is IPv6-only; Render is IPv4-only → P1001 unreachable). |
   | `DIRECT_URL` | Only used by local `prisma db push`, never at runtime. Set it to the Supabase **session pooler** (pooler host, port 5432) or the direct URI — doesn't matter for Render since the container no longer runs db push. |
   | `ANTHROPIC_API_KEY` | Claude key (real scripts/metadata/review) |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client |
   | `GOOGLE_REDIRECT_URI` | `https://<service>.onrender.com/api/auth/google/callback` |
   | `TOKEN_ENC_KEY` | any long random string (encrypts refresh tokens) |
   | `NEXTAUTH_URL` | the Vercel frontend URL (drives CORS) |
   | `NEXTAUTH_SECRET` | any long random string |
   | `ELEVENLABS_API_KEY` | optional — falls back to free edge-tts |
   | `PEXELS_API_KEY` | B-roll |
   | `PIXABAY_API_KEY` | (music synth is procedural; key currently unused) |
   | `YOUTUBE_API_KEY` | optional — trend search |
   | `SCHEDULER_SECRET` | **auto-generated** by `render.yaml` (`generateValue`). Protects `POST /api/scheduler/run`. Nothing to set — read it from the dashboard only if you want to drive the scheduler from an external cron. |
   | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_BUCKET_NAME` | Object storage for rendered MP4s. **Strongly recommended in prod** (see "Ephemeral media" caveat below). Cloudflare R2 works — set `AWS_ENDPOINT_URL=https://<acct>.r2.cloudflarestorage.com` and `AWS_REGION=auto`. |
   | `PUBLIC_BACKEND_URL` | Optional. Used to build webhook callback URLs. On Render the `RENDER_EXTERNAL_URL` env var is set automatically and serves the same purpose. |
   | `WEBHOOK_SECRET` | Optional. Without it, video providers fall back to polling — set it (and only then) to let Kling / Veo / etc. notify on completion instantly. `openssl rand -hex 32`. |
   | `REDIS_URL` | Optional today (one Render instance → in-memory render lock is fine). **Required** the moment you scale to more than one backend instance. |

   `MOCK_MODE=false`, `NODE_ENV=production`, `CLAUDE_MODEL` are already in
   `render.yaml`. Do **not** put secrets in the file — dashboard only.
4. Deploy. The container runs `npm start`. On boot it applies any pending
   schema bumps via the pooled `DATABASE_URL` (see `backend/src/lib/dbMigrate.js`)
   — Render itself can't run `prisma db push` because that needs `DIRECT_URL`
   and Supabase's direct host is IPv6-only (P1001). When you change
   `schema.prisma`, append the matching `ALTER TABLE … IF NOT EXISTS` to
   `dbMigrate.js`'s `STATEMENTS` list in the same commit; the next deploy
   picks it up. Health: `GET /api/health`.
5. Note the service URL, e.g. `https://flowtube-backend.onrender.com`.

## 2. Frontend on Vercel

1. Vercel → **New Project** → this repo.
2. **Root Directory: `frontend`** (important — monorepo).
3. Framework preset: Next.js (auto). Build/output defaults are fine.
4. Env var: `NEXT_PUBLIC_API_URL = https://<render-service>.onrender.com/api`
5. Deploy. Note the Vercel URL, e.g. `https://flowtube.vercel.app`.

## 3. Wire the two together

- Set Render `NEXTAUTH_URL` = the Vercel URL (backend CORS allows it).
- Set Render `GOOGLE_REDIRECT_URI` = `https://<render>.onrender.com/api/auth/google/callback`.
- **Google Cloud Console** → APIs & Services → Credentials → your OAuth client:
  - Authorized redirect URI: the `GOOGLE_REDIRECT_URI` above.
  - OAuth consent screen → add your Google account under **Test users**
    (YouTube scopes are sensitive while the app is in Testing).
- Redeploy the Render service after changing its env vars.

---

## Caveats (read before relying on this)

- **Autonomous publishing depends on the web service staying up.** The
  calendar scheduler runs *inside* the backend process (a 60 s interval) and
  publishes due `auto` entries on its own — no browser needed. It only ticks
  while that process is awake, so a **non-sleeping plan is required**: the
  **free** plan sleeps when idle and the scheduler stops until traffic wakes
  it. `starter`+ runs 24/7. For extra redundancy, point an external cron /
  uptime monitor at `POST /api/scheduler/run` (auth: `SCHEDULER_SECRET`).
- **Render plan / RAM.** FFmpeg + edge-tts is CPU/RAM heavy. The **free**
  plan (512 MB, 0.1 CPU, sleeps when idle) will be slow and can OOM on
  long-form renders. `render.yaml` defaults to **`starter`** (paid) as the
  realistic minimum. Change `plan:` if you accept free-tier limits.
- **Media persistence.** With `AWS_BUCKET_NAME` set, rendered MP4s persist
  to S3/R2 and the YouTube upload streams from there — surviving any
  restart between render and publish. **Strongly recommended:** the
  scheduler's 2-hour advance render window means a restart in that gap
  silently loses the file without a bucket. Without it the pipeline still
  works for immediate-publish flows but auto-publish becomes best-effort.
- **Long renders vs request timeout.** `/api/generate/video` returns 202 in
  <1s and renders in the background; the frontend polls `/generate/video/:id`
  for completion. Long-form renders (up to 24 scenes through Kling/Veo) can
  take 15+ minutes; the poll window is sized for that. The scheduler renders
  serially on a single instance to stay inside Render Starter's 512 MB cap.
- **Voice.** ElevenLabs (if quota) → **edge-tts (free neural, default)** →
  `say` (Linux has no `say`, so edge-tts is effectively required; the
  Dockerfile installs it).
- **Music** is synthesized procedurally (copyright-safe). Pixabay has no
  music API; `PIXABAY_API_KEY` is currently unused.
- **Secrets** are never committed (`.gitignore` covers `.env*`). Set them
  in the Render/Vercel dashboards only — **not** in any `.env` file on
  your laptop. If you've ever pasted a production key into a local
  `.env`, rotate it (Anthropic / Google / Kling / etc. all expose a
  rotate button). Use a separate Supabase project + separate test API
  keys for local dev.
- **Health.** `GET /api/health` reports per-subsystem state (database,
  storage bucket, Redis, scheduler tick freshness, API-key presence).
  Point Render's healthcheck and any external uptime monitor at this —
  it 503s when the DB is unreachable.
