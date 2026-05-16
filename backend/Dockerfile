# FlowTube backend — needs FFmpeg (video assembly), Python + edge-tts (free
# neural voiceover), and Node. Debian slim so apt/pip "just work".
FROM node:20-slim

# System deps:
#  - ffmpeg  → the entire video assembly + audio mix pipeline
#  - python3 + edge-tts → free realistic neural TTS (primary voice engine)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && pip3 install --no-cache-dir --break-system-packages edge-tts \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install node deps first for layer caching. `npm ci` keeps devDeps because
# the Prisma CLI (prisma generate / db push) lives there.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

ENV NODE_ENV=production
# Render injects $PORT; the app reads process.env.PORT (defaults to 4000).
EXPOSE 4000

# Sync schema to the (Supabase) DB on boot, then start. db push is idempotent.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
