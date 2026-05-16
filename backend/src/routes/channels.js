import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../lib/auth.js';
import { detectChannels, generateChannelIdentity } from '../services/youtube.js';

const router = Router();
router.use(requireUser);

// List all channels across the user's connected Google accounts.
router.get('/', async (req, res, next) => {
  try {
    const channels = await prisma.youtubeChannel.findMany({
      where: { googleAccount: { userId: req.user.id } },
      include: { _count: { select: { videos: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ channels: channels.map(serialize) });
  } catch (e) {
    next(e);
  }
});

// Detect channels on every connected Google account. Upserts found channels.
// Returns accounts that have ZERO channels so the UI can offer AI setup.
router.post('/detect', async (req, res, next) => {
  try {
    const accounts = await prisma.googleAccount.findMany({ where: { userId: req.user.id } });
    const found = [];
    const emptyAccounts = [];

    for (const acct of accounts) {
      const detected = await detectChannels({
        accessToken: acct.accessToken,
        refreshToken: acct.refreshTokenEnc,
      });
      if (detected.length === 0) {
        emptyAccounts.push({ googleAccountId: acct.id, email: acct.email });
        continue;
      }
      for (const ch of detected) {
        const saved = await prisma.youtubeChannel.upsert({
          where: { channelId: ch.channelId },
          update: {
            name: ch.name,
            handle: ch.handle,
            language: ch.language ?? 'English',
            subscriberCount: ch.subscriberCount,
            videoCount: ch.videoCount,
            viewCount: BigInt(ch.viewCount ?? 0),
          },
          create: {
            googleAccountId: acct.id,
            channelId: ch.channelId,
            name: ch.name,
            handle: ch.handle,
            niche: 'custom',
            language: ch.language ?? 'English',
            description: ch.description ?? '',
            subscriberCount: ch.subscriberCount,
            videoCount: ch.videoCount,
            viewCount: BigInt(ch.viewCount ?? 0),
            aiIdentity: { avatarUrl: ch.avatarUrl },
            setupCompleted: true,
          },
        });
        found.push(serialize(saved));
      }
    }
    res.json({ channels: found, emptyAccounts });
  } catch (e) {
    next(e);
  }
});

// AI-generate a channel identity for an account that had no channel.
router.post('/ai-identity', async (req, res, next) => {
  try {
    const { niche } = req.body ?? {};
    if (!niche) return res.status(400).json({ error: 'niche required' });
    res.json({ identity: generateChannelIdentity({ niche }) });
  } catch (e) {
    next(e);
  }
});

// Fetch a single channel the user owns (channel-workspace pages use this).
router.get('/:id', async (req, res, next) => {
  try {
    const c = await prisma.youtubeChannel.findFirst({
      where: { id: req.params.id, googleAccount: { userId: req.user.id } },
      include: {
        _count: { select: { videos: true } },
        googleAccount: { select: { email: true } },
      },
    });
    if (!c) return res.status(404).json({ error: 'Channel not found' });
    res.json({ channel: { ...serialize(c), accountEmail: c.googleAccount.email } });
  } catch (e) {
    next(e);
  }
});

// Persist the AI-proposed channel as "pending" until the user completes the
// one-time manual creation on YouTube (the only path that actually exists).
router.post('/create-pending', async (req, res, next) => {
  try {
    const { googleAccountId, niche, language, identity } = req.body ?? {};
    const acct = await prisma.googleAccount.findFirst({
      where: { id: googleAccountId, userId: req.user.id },
    });
    if (!acct) return res.status(404).json({ error: 'Google account not found' });

    const channel = await prisma.youtubeChannel.create({
      data: {
        googleAccountId: acct.id,
        channelId: `pending:${acct.id}:${Date.now()}`,
        name: identity?.name ?? 'New FlowTube Channel',
        handle: identity?.handle ?? null,
        niche,
        language: language ?? 'English',
        description: identity?.description ?? '',
        isAiProposed: true,
        aiIdentity: identity,
        setupCompleted: false,
      },
    });
    res.json({ channel: serialize(channel) });
  } catch (e) {
    next(e);
  }
});

// Edit a channel's description / niche / language (Settings page).
// The description directly steers script generation + trend picks.
router.patch('/:id', async (req, res, next) => {
  try {
    const owned = await prisma.youtubeChannel.findFirst({
      where: { id: req.params.id, googleAccount: { userId: req.user.id } },
    });
    if (!owned) return res.status(404).json({ error: 'Channel not found' });

    const data = {};
    if (typeof req.body?.description === 'string')
      data.description = req.body.description.slice(0, 600);
    if (typeof req.body?.niche === 'string') data.niche = req.body.niche;
    if (typeof req.body?.language === 'string') data.language = req.body.language;

    const channel = await prisma.youtubeChannel.update({
      where: { id: owned.id },
      data,
    });
    res.json({ channel: serialize(channel) });
  } catch (e) {
    next(e);
  }
});

function serialize(c) {
  return {
    id: c.id,
    channelId: c.channelId,
    name: c.name,
    handle: c.handle,
    niche: c.niche,
    language: c.language ?? 'English',
    description: c.description ?? '',
    subscriberCount: c.subscriberCount,
    videoCount: c.videoCount,
    viewCount: Number(c.viewCount ?? 0),
    isMonetized: c.isMonetized,
    monetizationStatus: c.monetizationStatus,
    isAiProposed: c.isAiProposed,
    setupCompleted: c.setupCompleted,
    aiIdentity: c.aiIdentity ?? null,
    viralScore: c.viralDNA?.avgRetentionViral ?? null,
    videoCountLocal: c._count?.videos ?? 0,
  };
}

export default router;
