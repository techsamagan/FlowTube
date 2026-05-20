// Calendar scheduler. A single Node interval is enough for the one-instance
// Render deployment; each tick:
//   1. Recovers from crashes (any row stuck in *ing → previous state).
//   2. Renders + publishes due `planned + auto` entries.
//   3. Publishes due `ready` entries (rendered + approved earlier, waiting).
//
// Concurrency: rows are claimed via `updateMany` with a status guard so two
// ticks (or two pods) can't double-process the same entry.

import { prisma } from '../lib/prisma.js';
import { renderVideo, publishVideoToYouTube, publicBaseUrl } from './videoPipeline.js';

const TICK_MS = 60_000;
let timer = null;
let runningCount = 0;
const MAX_CONCURRENT = 1; // video rendering is CPU/RAM heavy, keep it serial

async function claim(entryId, fromStatus, toStatus) {
  const r = await prisma.calendarEntry.updateMany({
    where: { id: entryId, status: fromStatus },
    data: { status: toStatus, lastError: null },
  });
  return r.count === 1;
}

async function fail(entryId, err) {
  // eslint-disable-next-line no-console
  console.error(`[scheduler] entry ${entryId} failed:`, err?.message ?? err);
  await prisma.calendarEntry
    .update({
      where: { id: entryId },
      data: { status: 'failed', lastError: String(err?.message ?? err).slice(0, 500) },
    })
    .catch(() => {});
}

async function processAutoRender(entry) {
  const claimed = await claim(entry.id, 'planned', 'generating');
  if (!claimed) return;
  const channel = await prisma.youtubeChannel.findUnique({
    where: { id: entry.channelId },
    include: { googleAccount: true },
  });
  if (!channel) return fail(entry.id, 'channel missing');

  try {
    const rendered = await renderVideo({
      channel,
      topic: entry.topic,
      format: entry.format,
      baseUrl: publicBaseUrl(),
      calendarEntryId: entry.id,
    });
    // Render done — link, then immediately try to publish (auto mode).
    await prisma.calendarEntry.update({
      where: { id: entry.id },
      data: { videoId: rendered.videoId, status: 'publishing' },
    });
    if (!rendered.canUpload) {
      return fail(
        entry.id,
        'Rendered but channel is not connected to a real Google account; cannot auto-publish.',
      );
    }
    await publishVideoToYouTube({ videoId: rendered.videoId });
    // publishVideoToYouTube also marks the entry `published`.
  } catch (e) {
    await fail(entry.id, e);
  }
}

async function processReadyPublish(entry) {
  if (!entry.videoId) return fail(entry.id, 'No video attached to publish.');
  const claimed = await claim(entry.id, 'ready', 'publishing');
  if (!claimed) return;
  try {
    await publishVideoToYouTube({ videoId: entry.videoId });
  } catch (e) {
    await fail(entry.id, e);
  }
}

async function tick() {
  if (runningCount >= MAX_CONCURRENT) return;
  runningCount++;
  try {
    const now = new Date();

    // 1. Pull a small batch of due rows. Auto rows are rendered+published in
    //    one go; ready rows are upload-only and run in parallel with render
    //    in future ticks if we ever raise MAX_CONCURRENT.
    const due = await prisma.calendarEntry.findMany({
      where: {
        scheduledFor: { lte: now },
        status: { in: ['planned', 'ready'] },
        OR: [
          { status: 'planned', autoMode: 'auto' },
          { status: 'ready' }, // manual-mode entries already pre-approved
        ],
      },
      orderBy: { scheduledFor: 'asc' },
      take: 5,
    });

    for (const entry of due) {
      if (entry.status === 'planned' && entry.autoMode === 'auto') {
        await processAutoRender(entry);
      } else if (entry.status === 'ready') {
        await processReadyPublish(entry);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[scheduler] tick error:', e);
  } finally {
    runningCount--;
  }
}

// Crash recovery: on boot, reset anything caught mid-action back to its
// previous waiting state so the next tick can retry.
async function recover() {
  await prisma.calendarEntry
    .updateMany({ where: { status: 'generating' }, data: { status: 'planned' } })
    .catch(() => {});
  await prisma.calendarEntry
    .updateMany({ where: { status: 'publishing' }, data: { status: 'ready' } })
    .catch(() => {});
}

export async function startScheduler() {
  if (timer) return; // already started
  await recover();
  // eslint-disable-next-line no-console
  console.log('[scheduler] started, tick =', TICK_MS, 'ms');
  // Fire once shortly after boot, then on the interval.
  timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  setTimeout(() => void tick(), 5_000);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
