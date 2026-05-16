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

# Start the API. Schema changes are applied out-of-band via
# `npx prisma db push` against Supabase (run from a dev machine) — NOT on
# every boot: Prisma's db push needs DIRECT_URL, and Supabase's direct
# connection is IPv6-only while Render is IPv4-only (P1001). Prisma Client
# at runtime uses only the pooled DATABASE_URL, which Render can reach.
CMD ["npm", "start"]
