import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../lib/auth.js';
import { recommend } from '../services/viralAnalysis.js';

const router = Router();
router.use(requireUser);

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function ownedChannel(req, channelId) {
  return prisma.youtubeChannel.findFirst({
    where: { id: channelId, googleAccount: { userId: req.user.id } },
  });
}

function serialize(e) {
  return {
    id: e.id,
    channelId: e.channelId,
    scheduledFor: e.scheduledFor,
    topic: e.topic,
    format: e.format,
    notes: e.notes,
    source: e.source,
    status: e.status,
    videoId: e.videoId,
  };
}

// List a channel's calendar (upcoming first).
router.get('/', async (req, res, next) => {
  try {
    const channel = await ownedChannel(req, req.query.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const entries = await prisma.calendarEntry.findMany({
      where: { channelId: channel.id },
      orderBy: { scheduledFor: 'asc' },
    });
    res.json({ entries: entries.map(serialize) });
  } catch (e) {
    next(e);
  }
});

// Add a manual calendar entry.
router.post('/', async (req, res, next) => {
  try {
    const { channelId, scheduledFor, topic, format, notes } = req.body ?? {};
    const channel = await ownedChannel(req, channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!topic || !scheduledFor)
      return res.status(400).json({ error: 'topic and scheduledFor are required' });
    const when = new Date(scheduledFor);
    if (Number.isNaN(when.getTime()))
      return res.status(400).json({ error: 'Invalid scheduledFor date' });

    const entry = await prisma.calendarEntry.create({
      data: {
        channelId: channel.id,
        scheduledFor: when,
        topic: String(topic).slice(0, 200),
        format: format === 'long' ? 'long' : 'short',
        notes: String(notes ?? '').slice(0, 500),
        source: 'manual',
      },
    });
    res.json({ entry: serialize(entry) });
  } catch (e) {
    next(e);
  }
});

// AI-generate a calendar: map the channel's best posting windows onto the
// next `days` and fill them with its top recommended topics.
router.post('/ai-generate', async (req, res, next) => {
  try {
    const { channelId } = req.body ?? {};
    const days = Math.min(60, Math.max(1, Number(req.body?.days ?? 14)));
    const defaultFormat = req.body?.format === 'long' ? 'long' : 'short';
    const replace = req.body?.replace !== false; // default: replace AI entries
    const channel = await ownedChannel(req, channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const rec = await recommend(channel);
    const windows = (rec.whenToPost ?? []).slice(0, 4);
    const topics = (rec.whatToMake ?? []).map((w) => w.topic);
    if (windows.length === 0 || topics.length === 0)
      return res
        .status(422)
        .json({ error: 'Not enough trend data yet — run a trend scan first.' });

    const wantDay = new Set(windows.map((w) => DAYS.indexOf(w.day)));
    const hourFor = (dow) =>
      windows.find((w) => DAYS.indexOf(w.day) === dow)?.hour ?? 9;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const planned = [];
    let ti = 0;
    for (let d = 1; d <= days; d++) {
      const date = new Date(start);
      date.setDate(date.getDate() + d);
      if (!wantDay.has(date.getDay())) continue;
      date.setHours(hourFor(date.getDay()), 0, 0, 0);
      const pick = rec.whatToMake[ti % topics.length];
      planned.push({
        channelId: channel.id,
        scheduledFor: new Date(date),
        topic: pick.topic,
        format: defaultFormat,
        notes: pick.rationale?.slice(0, 500) ?? '',
        source: 'ai',
      });
      ti++;
    }

    if (replace)
      await prisma.calendarEntry.deleteMany({
        where: { channelId: channel.id, source: 'ai', status: 'planned' },
      });
    if (planned.length) await prisma.calendarEntry.createMany({ data: planned });

    const entries = await prisma.calendarEntry.findMany({
      where: { channelId: channel.id },
      orderBy: { scheduledFor: 'asc' },
    });
    res.json({ created: planned.length, entries: entries.map(serialize) });
  } catch (e) {
    next(e);
  }
});

// Delete a calendar entry.
router.delete('/:id', async (req, res, next) => {
  try {
    const entry = await prisma.calendarEntry.findFirst({
      where: { id: req.params.id, channel: { googleAccount: { userId: req.user.id } } },
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    await prisma.calendarEntry.delete({ where: { id: entry.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
