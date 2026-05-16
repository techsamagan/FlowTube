import 'dotenv/config';

// MOCK_MODE defaults ON so the whole platform runs with zero external keys.
// Set MOCK_MODE=false once real credentials are in .env.
export const MOCK_MODE = (process.env.MOCK_MODE ?? 'true') !== 'false';

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  FRONTEND_URL: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  GOOGLE_REDIRECT_URI:
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/api/auth/google/callback',

  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  CLAUDE_MODEL: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',

  // Public YouTube Data API key — powers real trend/competitor search
  // (search.list is public data, no per-user OAuth needed).
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ?? '',

  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY ?? '',
  PEXELS_API_KEY: process.env.PEXELS_API_KEY ?? '',
  // Royalty-free background music (Content-ID safe). No key → renders silent
  // (no music), never copyrighted audio.
  PIXABAY_API_KEY: process.env.PIXABAY_API_KEY ?? '',

  // Key for encrypting Google refresh tokens at rest (AES-256-GCM).
  TOKEN_ENC_KEY: process.env.TOKEN_ENC_KEY ?? process.env.NEXTAUTH_SECRET ?? 'dev-only-insecure-key',
};

// Real Google OAuth works the moment client id/secret are present —
// INDEPENDENT of MOCK_MODE, so AI can stay mocked while channels are real.
export const GOOGLE_OAUTH_CONFIGURED = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
);

if (MOCK_MODE) {
  // eslint-disable-next-line no-console
  console.log(
    `🟡 MOCK_MODE on. Google OAuth ${GOOGLE_OAUTH_CONFIGURED ? 'CONFIGURED (real channels)' : 'not configured (mock channels)'}.`,
  );
}
