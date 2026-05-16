# FlowTube

Multi-channel YouTube Shorts automation & viral-analysis platform.

> **Build status — vertical slice.** This pass delivers the full scaffold
> (folder structure, complete Prisma schema, docker-compose, `.env.example`)
> plus **one path working end-to-end in mock mode**:
>
> **Google login → detect / AI-generate channel → viral script generator.**
>
> Everything runs with **zero API keys** (`MOCK_MODE=true`). Real adapters for
> Google/Claude/ElevenLabs/Pexels are wired behind the mock flag.

---

## ⚠️ Honest limitations (read this)

The spec asks for "log in with Google → if no channel, auto-create one and
auto-set a generated profile picture." **This is not possible with official
APIs:**

- **YouTube Data API v3 has no `channels.insert`.** You cannot create a
  channel programmatically. Channels are only created through Google's own
  web flow by a human.
- **Channel avatar/banner are read-only via the API.** `channels.update`
  exposes branding *text* (title, description, keywords) but not the image.

So FlowTube does the honest version: when an account has no channel it
**AI-generates the full identity** (name, handle, description, an avatar
image), hands you a one-time "Create on YouTube" link, then auto-syncs every
field the API *does* allow. Anything that claims full auto-creation is using
browser-automation bots against youtube.com — fragile and against YouTube ToS.

Bulk AI upload across many channels also carries real YouTube spam-policy
risk; that's a product decision for you, not a technical blocker.

---

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | Next.js 14 (App Router), Tailwind, Framer Motion |
| Backend  | Node + Express (REST) |
| DB       | PostgreSQL via Prisma |
| Queue    | BullMQ + Redis (scaffolded; no-op without `REDIS_URL`) |
| AI       | Claude (`claude-sonnet-4-20250514`) |
| Media    | ElevenLabs (TTS), Pexels (b-roll), FFmpeg (assembly) — *adapters stubbed* |

## Quick start (mock mode, no keys)

**Database — use Supabase (recommended) or local Postgres.**

Supabase: create a project → Project Settings → Database → Connection string.
Put the **Transaction pooler** URI (port 6543, add
`?pgbouncer=true&connection_limit=1`) in `DATABASE_URL` and the **Direct
connection** URI (port 5432) in `DIRECT_URL` in `backend/.env`. Prisma uses
`DATABASE_URL` at runtime and `DIRECT_URL` for `db push`/migrations.
No Docker Postgres needed — only Redis.

```bash
# 1. Queue (Postgres is Supabase; local pg only if NOT using Supabase)
cd flowtube
docker compose up -d redis        # add `postgres` only for local-DB mode

# 2. Backend
cd backend
cp .env.example .env          # set DATABASE_URL + DIRECT_URL (Supabase)
npm install
npx prisma db push            # creates all tables in your Supabase DB
npm run dev                   # → http://localhost:4000

# 3. Frontend (new terminal)
cd ../frontend
cp .env.example .env.local
npm install
npm run dev                   # → http://localhost:3000
```

Open http://localhost:3000:

1. **Sign in** — pick *"Google account with NO channel"* to see the
   AI-generated guided setup, or the other option for an existing channel.
2. **Dashboard** — click **Detect channels**. The empty account surfaces the
   **AI Setup** card: choose a niche → *Generate identity* → AI name/handle/
   avatar/description + the one-time YouTube create link.
3. **Generate** — pick a niche/topic → Claude (mock) returns a script built to
   the exact viral blueprint with a 1–10 viral score and loop explanation.

## Connect real YouTube data

`+ Connect Google account` runs **real Google OAuth** the moment credentials
are present — `MOCK_MODE` can stay `true` (AI mocked, channels real).

1. **Google Cloud Console** → create/select a project.
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen** → External; add your Google address under
   **Test users** (sensitive YouTube scopes require this while in *Testing*).
4. **Credentials → Create credentials → OAuth client ID** → *Web application*.
   - **Authorized redirect URI:** `http://localhost:4000/api/auth/google/callback`
5. Put the values in `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   TOKEN_ENC_KEY=<any long random string>
   ```
6. Restart the backend. Register/sign in → **+ Connect Google account** →
   Google consent → you're returned to the dashboard with your **real**
   channels (subscribers, views, etc.).

The refresh token is encrypted at rest (AES-256-GCM); the account is linked
to the signed-in user via the OAuth `state`. Still impossible by API and
unchanged: **creating a channel or setting its avatar** — see limitations above.

### Go fully live (all real data)

Each credential is independent — add only what you have:

| Add to `backend/.env` | Makes real | Also needs |
|---|---|---|
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Connecting your real YouTube channels | — (works with `MOCK_MODE=true`) |
| `ANTHROPIC_API_KEY` | Claude scripts, metadata, recommendations | `MOCK_MODE=false` |
| `YOUTUBE_API_KEY` (Google Cloud API key, YouTube Data API v3 enabled) | Trend/competitor search in Trends | — (independent of OAuth & MOCK_MODE) |

Then restart the backend. The startup log prints which subsystems are real.
If `MOCK_MODE=false` but `YOUTUBE_API_KEY` is missing, trend search logs a
loud warning and uses the mock corpus (never silently fake in real mode).

> Honest data caveat: YouTube does **not** expose audience retention for
> *other people's* videos. Real competitor "retention" is therefore an
> estimate derived from like+comment-to-view ratios (see `services/youtube.js`).
> Your **own** videos' retention will be exact via the Analytics API (wired
> in the analytics slice).

## What's real vs scaffolded in this slice

| Working end-to-end | Scaffolded (next slice) |
|---|---|
| Mock Google auth + session | Real NextAuth.js + OAuth UI |
| Channel detect / upsert | YouTube Analytics fetch |
| AI channel identity flow | Viral analysis engine (the "brain") |
| Viral script + SEO metadata | BullMQ 7-step video pipeline |
| Full Prisma schema (8+ models) | Scheduler, calendar, analytics screens |

The real adapters (`services/youtube.js`, `services/claude.js`) already
contain the production code paths — set `MOCK_MODE=false` and add keys to
exercise them. Channel creation/avatar will still require the manual step.

## Layout

```
flowtube/
├── backend/   Express API · Prisma schema · queues · services
└── frontend/  Next.js App Router · dark UI · Framer Motion
```
