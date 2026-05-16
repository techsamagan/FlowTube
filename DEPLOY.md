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

   `MOCK_MODE=false`, `NODE_ENV=production`, `CLAUDE_MODEL` are already in
   `render.yaml`. Do **not** put secrets in the file — dashboard only.
4. Deploy. The container just runs `npm start` (no db push on boot). Apply
   schema changes out-of-band from a dev machine: `npx prisma db push`
   against Supabase. The schema is already synced. Health: `GET /api/health`.
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

- **Render plan / RAM.** FFmpeg + edge-tts is CPU/RAM heavy. The **free**
  plan (512 MB, 0.1 CPU, sleeps when idle) will be slow and can OOM on
  long-form renders. `render.yaml` defaults to **`starter`** (paid) as the
  realistic minimum. Change `plan:` if you accept free-tier limits.
- **Ephemeral media (chosen).** Rendered MP4s live on the container disk and
  are wiped on every redeploy/restart. That's accepted: the canonical copy is
  the YouTube upload. Local `/media/<id>.mp4` is a preview only.
- **Long renders vs request timeout.** `/api/generate/video` is synchronous
  and can take minutes (long-form especially). Render web services allow long
  requests, but a cold-started free instance plus a 4–10 min render may still
  hit client/proxy timeouts. Shorts are safe; long-form is best-effort until
  the BullMQ worker path is wired.
- **Voice.** ElevenLabs (if quota) → **edge-tts (free neural, default)** →
  `say` (Linux has no `say`, so edge-tts is effectively required; the
  Dockerfile installs it).
- **Music** is synthesized procedurally (copyright-safe). Pixabay has no
  music API; `PIXABAY_API_KEY` is currently unused.
- **Secrets** are never committed (`.gitignore` covers `.env*`). Set them in
  the Render/Vercel dashboards only.
