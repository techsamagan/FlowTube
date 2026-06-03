import express from 'express';
import cors from 'cors';
import { env, MOCK_MODE } from './env.js';
import authRoutes from './routes/auth.js';
import channelRoutes from './routes/channels.js';
import generateRoutes, { MEDIA_DIR } from './routes/generate.js';
import analysisRoutes from './routes/analysis.js';
import calendarRoutes from './routes/calendar.js';
import accountRoutes from './routes/accounts.js';
import schedulerRoutes from './routes/scheduler.js';
import webhookRoutes from './routes/webhooks.js';
import { startScheduler, schedulerStatus } from './services/scheduler.js';
import { ensureSchema } from './lib/dbMigrate.js';
import { prisma } from './lib/prisma.js';
import { bucketReachable, isStorageConfigured } from './services/storage.js';

const app = express();
// Accept the configured production origin AND localhost dev. Browsers send
// one Origin header per request — credentials:true requires we echo it back
// exactly, so a function predicate is used instead of an array literal.
const ALLOWED_ORIGINS = new Set([env.FRONTEND_URL, 'http://localhost:3000']);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      cb(new Error(`CORS blocked for origin ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

// Rendered MP4s (served cross-origin to the Next.js frontend).
app.use('/media', cors(), express.static(MEDIA_DIR));

app.get('/api/health', async (_req, res) => {
  // Probe each subsystem in parallel and return per-subsystem status. DB is
  // the only "fatal" one — if it's down the app can't serve anything useful,
  // so we return 503. Everything else is informational (a missing API key
  // means a degraded mode, not an outage).
  const [dbOk, storageOk] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    isStorageConfigured() ? bucketReachable() : Promise.resolve(null),
  ]);

  const sched = schedulerStatus();
  // A scheduler stuck mid-cycle for >10 min is a real problem worth flagging
  // even though the endpoint stays green for it.
  const schedulerHealthy =
    !sched.running ||
    sched.secondsSinceLastTick === null ||
    sched.secondsSinceLastTick < 600;

  const body = {
    ok: dbOk,
    mockMode: MOCK_MODE,
    service: 'flowtube-backend',
    checks: {
      database: dbOk ? 'ok' : 'down',
      storage:
        storageOk === null
          ? 'not-configured'
          : storageOk
            ? 'ok'
            : 'unreachable',
      redis: process.env.REDIS_URL ? 'configured' : 'not-configured',
      anthropic: env.ANTHROPIC_API_KEY ? 'configured' : 'not-configured',
      elevenlabs: env.ELEVENLABS_API_KEY ? 'configured' : 'not-configured',
      youtubeOAuth: env.GOOGLE_CLIENT_ID ? 'configured' : 'not-configured',
      scheduler: schedulerHealthy ? 'ok' : 'stalled',
    },
    scheduler: sched,
  };
  res.status(dbOk ? 200 : 503).json(body);
});

app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/scheduler', schedulerRoutes);
// Webhooks must be auth-token free (providers can't carry our user JWT) —
// they're secured with WEBHOOK_SECRET in the X-Webhook-Secret header.
app.use('/api/webhooks', webhookRoutes);

// 404 for unmatched API routes (JSON, not Express's HTML page).
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler — keeps route handlers thin.
app.use((err, _req, res, _next) => {
  // Malformed JSON body → 400, not 500.
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: err.message ?? 'Internal error' });
});

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 FlowTube API on http://localhost:${env.PORT} (mock=${MOCK_MODE})`);
  // Real-mode boot: apply any pending schema bumps via the pooled DATABASE_URL
  // (Render can't run `prisma db push` — see lib/dbMigrate.js), then start the
  // calendar scheduler. Skipped in mock mode (schema is in-memory / stubbed).
  if (!MOCK_MODE) {
    (async () => {
      await ensureSchema().catch((e) =>
        // eslint-disable-next-line no-console
        console.error('[db-migrate] failed to start:', e),
      );
      await startScheduler().catch((e) =>
        // eslint-disable-next-line no-console
        console.error('[scheduler] failed to start:', e),
      );
    })();
  }
});
