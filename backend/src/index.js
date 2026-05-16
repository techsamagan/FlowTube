import express from 'express';
import cors from 'cors';
import { env, MOCK_MODE } from './env.js';
import authRoutes from './routes/auth.js';
import channelRoutes from './routes/channels.js';
import generateRoutes, { MEDIA_DIR } from './routes/generate.js';
import analysisRoutes from './routes/analysis.js';
import calendarRoutes from './routes/calendar.js';
import accountRoutes from './routes/accounts.js';

const app = express();
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Rendered MP4s (served cross-origin to the Next.js frontend).
app.use('/media', cors(), express.static(MEDIA_DIR));

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, mockMode: MOCK_MODE, service: 'flowtube-backend' }),
);

app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/accounts', accountRoutes);

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
});
