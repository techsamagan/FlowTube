// Scheduler control endpoints — let an external cron / uptime monitor trigger
// a publishing cycle on demand, and expose the queue for visibility. The
// autonomous interval in services/scheduler.js already runs server-side; this
// is "publish now" plus an optional redundancy hook (point any external
// scheduler at POST /run so publishing survives even a wedged web process).
//
// Auth: a shared secret. Set SCHEDULER_SECRET and callers must present it as
// `Authorization: Bearer <secret>`, header `x-scheduler-secret`, or `?secret=`.
// With no secret set the endpoints are open (fine for local dev only).

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { MOCK_MODE } from '../env.js';
import { runSchedulerCycle } from '../services/scheduler.js';

const router = Router();

function authorized(req) {
  const secret = process.env.SCHEDULER_SECRET;
  if (!secret) return true; // not configured → open (dev convenience)
  const hdr = req.get('authorization') ?? '';
  const bearer = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  return (
    bearer === secret ||
    req.get('x-scheduler-secret') === secret ||
    req.query.secret === secret
  );
}

// Trigger one scheduler cycle. A cycle renders video and can take minutes, so
// this is fire-and-forget: it responds immediately and the work runs in the
// background — the caller (a cron ping) never has to hold the connection.
router.post('/run', (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (MOCK_MODE)
    return res.json({ ok: true, started: false, note: 'Scheduler disabled in MOCK_MODE.' });
  runSchedulerCycle({ trigger: 'http' }).catch((e) =>
    // eslint-disable-next-line no-console
    console.error('[scheduler] http cycle error:', e),
  );
  res.status(202).json({ ok: true, started: true, note: 'Scheduler cycle started.' });
});

// Snapshot of the publishing queue — handy to confirm the scheduler is alive
// without opening the UI.
router.get('/status', async (req, res, next) => {
  try {
    if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
    const now = new Date();
    const [dueNow, planned, generating, ready, publishing, published, failed] =
      await Promise.all([
        prisma.calendarEntry.count({
          where: {
            scheduledFor: { lte: now },
            OR: [{ status: 'planned', autoMode: 'auto' }, { status: 'ready' }],
          },
        }),
        prisma.calendarEntry.count({ where: { status: 'planned' } }),
        prisma.calendarEntry.count({ where: { status: 'generating' } }),
        prisma.calendarEntry.count({ where: { status: 'ready' } }),
        prisma.calendarEntry.count({ where: { status: 'publishing' } }),
        prisma.calendarEntry.count({ where: { status: 'published' } }),
        prisma.calendarEntry.count({ where: { status: 'failed' } }),
      ]);
    res.json({
      ok: true,
      now,
      mockMode: MOCK_MODE,
      dueNow,
      counts: { planned, generating, ready, publishing, published, failed },
    });
  } catch (e) {
    next(e);
  }
});

export default router;
