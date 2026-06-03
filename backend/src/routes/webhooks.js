// Provider webhook receiver — fast-path for image-to-video completion.
//
// How it fits: video providers (Kling, Luma, Higgsfield, Veo) all take
// several minutes per scene. Polling each provider every 5s wastes provider
// requests and adds up to 5s of latency between "render done" and
// "FFmpeg assembly starts." Webhooks let us flip a scene to "done"
// instantly, then the pollJob loop in videoProviders.js picks the result up
// on its next tick (or fails-fast on error).
//
// Security: providers post from public Internet, so requests must carry the
// shared WEBHOOK_SECRET. Without it we don't trust the payload.
//
// Failure mode: if a webhook is missed/lost, polling still drives the job to
// completion — webhooks are an optimization, not a hard dependency.

import { Router } from 'express';
import { recordWebhookResult } from '../services/videoProviders.js';

const router = Router();

router.post('/video-done', (req, res) => {
  const secret = req.headers['x-webhook-secret'];
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { jobId, resultUrl, error } = req.body ?? {};
  if (!jobId) return res.status(400).json({ error: 'jobId required' });

  recordWebhookResult(String(jobId), { resultUrl, error });
  res.json({ ok: true });
});

export default router;
