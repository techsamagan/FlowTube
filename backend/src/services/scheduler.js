// Calendar scheduler — the autonomous engine behind the planner.
//
// It runs entirely server-side: once the backend process is up it keeps
// rendering and publishing scheduled videos whether or not anyone has the
// website open. A single Node interval drives it on the one-instance Render
// deployment; each cycle:
//   1. Renders + publishes every due `planned + auto` entry.
//   2. Publishes every due `ready` entry (rendered + approved earlier).
// Crash recovery runs once at boot (any row stuck *ing → previous state).
//
// Concurrency: rows are claimed via `updateMany` with a status guard so two
// cycles can't double-process the same entry, and a process-local mutex
// serialises cycles so the interval and an on-demand `POST /api/scheduler/run`
// never overlap.

import { prisma } from '../lib/prisma.js';
import { renderVideo, publishVideoToYouTube, publicBaseUrl } from './videoPipeline.js';

const TICK_MS = 60_000;
const BATCH = 25; // due rows pulled per cycle; leftovers roll to the next tick
let timer = null;
let busy = false; // process-local mutex — true while a cycle is running

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

// Process everything due right now (up to BATCH). Auto rows are rendered +
// published in one go; ready rows are upload-only.
async function drain() {
  const now = new Date();
  const due = await prisma.calendarEntry.findMany({
    where: {
      scheduledFor: { lte: now },
      OR: [
        { status: 'planned', autoMode: 'auto' },
        { status: 'ready' }, // approved earlier, waiting for its slot
      ],
    },
    orderBy: { scheduledFor: 'asc' },
    take: BATCH,
  });

  for (const entry of due) {
    if (entry.status === 'planned') await processAutoRender(entry);
    else await processReadyPublish(entry);
  }
  return { processed: due.length };
}

// Run one scheduler cycle behind the process-local mutex. Safe to call from
// the interval and from the HTTP trigger; an overlapping call is a no-op.
export async function runSchedulerCycle({ trigger = 'interval' } = {}) {
  if (busy) return { skipped: true, reason: 'a scheduler cycle is already running' };
  busy = true;
  try {
    const r = await drain();
    if (r.processed > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[scheduler] ${trigger}: processed ${r.processed} due entr${r.processed === 1 ? 'y' : 'ies'}`,
      );
    }
    return { skipped: false, ...r };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[scheduler] cycle error:', e);
    return { skipped: false, error: String(e?.message ?? e) };
  } finally {
    busy = false;
  }
}

// Crash recovery: on boot, reset anything caught mid-action back to its
// previous waiting state so the next cycle can retry.
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
  console.log(`[scheduler] started — autonomous publishing every ${TICK_MS / 1000}s`);
  // Fire once shortly after boot, then on the interval.
  timer = setInterval(() => void runSchedulerCycle({ trigger: 'interval' }), TICK_MS);
  setTimeout(() => void runSchedulerCycle({ trigger: 'boot' }), 5_000);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
