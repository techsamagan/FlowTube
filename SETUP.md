# YouTube Channel Manager — Setup

## 1. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

Copy `.env.example` → `.env` and fill in your keys:

```bash
cp .env.example .env
```

Generate an encryption key (run once):
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
Paste the output as `ENCRYPTION_KEY=` in `.env`.

**Google Cloud setup:**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable **YouTube Data API v3**
3. Credentials → Create **OAuth 2.0 Client ID** (Web app)
4. Add authorized redirect URI: `http://localhost:8000/api/auth/youtube/callback`
5. Copy Client ID & Secret into `.env`

**Start backend:**
```bash
uvicorn app.main:app --reload
```

## 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## 3. Workflow

1. Create a channel (name + genre + optional style notes)
2. Click **Connect YouTube** → authorize with Google
3. Click **Generate & Upload** to manually trigger a video
4. Or set a **Schedule** (cron) for automatic daily uploads

## System requirements

- `ffmpeg` must be installed (`brew install ffmpeg` on macOS)
- ImageMagick optional (enables text overlays on video: `brew install imagemagick`)
