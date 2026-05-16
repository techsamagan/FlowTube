import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../lib/auth.js';
import { recommend, scanTrends, refreshViralDNA } from '../services/viralAnalysis.js';

const router = Router();
router.use(requireUser);

async function ownedChannel(req, channelId) {
  return prisma.youtubeChannel.findFirst({
    where: { id: channelId, googleAccount: { userId: req.user.id } },
  });
}

// THE BRAIN: what kind of video to make next, and when to post it.
router.get('/recommendations', async (req, res, next) => {
  try {
    const channel = await ownedChannel(req, req.query.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    res.json(await recommend(channel));
  } catch (e) {
    next(e);
  }
});

// Re-scan trending/viral Shorts for the niche and store the snapshot.
router.post('/scan-trends', async (req, res, next) => {
  try {
    const channel = await ownedChannel(req, req.body?.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const corpus = await scanTrends(channel);
    const { dna } = await refreshViralDNA(channel);
    res.json({ scanned: corpus.length, viralDNA: dna });
  } catch (e) {
    next(e);
  }
});

router.get('/dna', async (req, res, next) => {
  try {
    const channel = await ownedChannel(req, req.query.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    res.json({ viralDNA: channel.viralDNA ?? null });
  } catch (e) {
    next(e);
  }
});

export default router;
