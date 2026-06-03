import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../lib/auth.js';
import { generateScript, generateMetadata } from '../services/claude.js';
import {
  renderVideo,
  publishVideoToYouTube,
  canUpload,
  MEDIA_DIR,
} from '../services/videoPipeline.js';
import { signedUrl } from '../services/storage.js';
import { acquire as acquireRenderLock, release as releaseRenderLock } from '../lib/renderLock.js';

const router = Router();
router.use(requireUser);

// Re-export for the existing import in src/index.js (static /media serving).
export { MEDIA_DIR };

// Generate a viral script (spec §3). Optionally attach it to a channel as a
// Video row in `generating` status — the entry point for the render pipeline.
router.post('/script', async (req, res, next) => {
  try {
    const { channelId, niche, topic } = req.body ?? {};
    if (!niche) return res.status(400).json({ error: 'niche required' });

    let channel = null;
    if (channelId) {
      channel = await prisma.youtubeChannel.findFirst({
        where: { id: channelId, googleAccount: { userId: req.user.id } },
      });
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
    }

    const script = await generateScript({
      niche,
      isCustomNiche: channel?.isCustomNiche ?? false,
      topic,
      viralDNA: channel?.viralDNA ?? undefined,
      description: channel?.description || undefined,
      language: channel?.language,
    });
    const metadata = await generateMetadata({ script, niche });

    let video = null;
    if (channel) {
      video = await prisma.video.create({
        data: {
          channelId: channel.id,
          script: script.fullScript,
          scriptMeta: script,
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          status: 'generating',
        },
      });
    }

    res.json({ script, metadata, videoId: video?.id ?? null });
  } catch (e) {
    next(e);
  }
});

// FULL real pipeline: see services/videoPipeline. Does NOT upload by
// default; the user reviews the verdict and approves via /video/:id/upload
// (immediate) or /video/:id/schedule (publish at calendar time).
// Kick off a render. Returns 202 with { videoId } in <1s; the actual render
// runs in the background. The frontend polls GET /api/generate/video/:id
// until status flips to 'ready' or 'failed'.
//
// Why async: a real render takes 60-180s. A synchronous HTTP response of
// that length is killed by Cloudflare/Render's edge proxy at ~30-35s,
// regardless of memory headroom. That was the root cause of the 502s and
// the 220 orphan 'generating' rows piling up in Supabase.
router.post('/video', async (req, res, next) => {
  const { channelId, topic, calendarEntryId = null, upload = false } = req.body ?? {};
  const format = req.body?.format === 'long' ? 'long' : 'short';

  // Try to claim the channel before doing any work — the lock is shared with
  // the scheduler, so this also blocks if a calendar entry just started
  // rendering on the same channel.
  const claimed = await acquireRenderLock(channelId);
  if (!claimed) {
    return res.status(409).json({
      error: 'A render is already in progress for this channel. Please wait for it to finish (or fail) before starting another.',
    });
  }

  try {
    const channel = await prisma.youtubeChannel.findFirst({
      include: { googleAccount: true },
      where: { id: channelId, googleAccount: { userId: req.user.id } },
    });
    if (!channel) {
      await releaseRenderLock(channelId);
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Create the placeholder Video row up-front so we can return its id to
    // the frontend in 202. The pipeline's prisma.video.create will be skipped
    // — we pass `videoId` through and renderVideo updates this row instead.
    const placeholder = await prisma.video.create({
      data: {
        channelId: channel.id,
        script: '',
        format,
        status: 'generating',
      },
    });

    // Fire-and-forget. The render writes its result back to the Video row;
    // the frontend polls. Any error is caught and stored on the row so the
    // poll surfaces a useful message.
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    (async () => {
      try {
        const result = await renderVideo({
          channel,
          topic,
          format,
          baseUrl,
          calendarEntryId,
          existingVideoId: placeholder.id,
        });
        if (upload && result.canUpload) {
          try {
            await publishVideoToYouTube({ videoId: result.videoId });
          } catch (upErr) {
            // eslint-disable-next-line no-console
            console.error(`[generate] Auto-publish for ${placeholder.id} failed:`, upErr.message);
          }
        }
      } catch (renderErr) {
        // eslint-disable-next-line no-console
        console.error(`[generate] Background render ${placeholder.id} failed:`, renderErr.message);
        await prisma.video
          .update({
            where: { id: placeholder.id },
            data: { status: 'failed' },
          })
          .catch(() => {});
      } finally {
        await releaseRenderLock(channelId);
      }
    })();

    return res.status(202).json({
      videoId: placeholder.id,
      status: 'generating',
      message: 'Render started. Poll GET /api/generate/video/:id for status.',
    });
  } catch (e) {
    await releaseRenderLock(channelId);
    next(e);
  }
});

// Most recent in-flight render for this channel, if any. The frontend hits
// this on mount so a page reload (or a different browser tab) reattaches to
// the existing render instead of orphaning it.
router.get('/channel/:channelId/active', async (req, res, next) => {
  try {
    const channel = await prisma.youtubeChannel.findFirst({
      where: { id: req.params.channelId, googleAccount: { userId: req.user.id } },
      select: { id: true },
    });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const active = await prisma.video.findFirst({
      where: { channelId: channel.id, status: 'generating' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, format: true, createdAt: true },
    });
    if (!active) return res.status(204).end();
    res.json({ videoId: active.id, format: active.format, startedAt: active.createdAt });
  } catch (e) {
    next(e);
  }
});

// Poll endpoint for the async render. Returns the current Video row state;
// when status is 'ready', also includes uploadNote/canUpload for the UI.
router.get('/video/:id', async (req, res, next) => {
  try {
    const video = await prisma.video.findFirst({
      where: { id: req.params.id, channel: { googleAccount: { userId: req.user.id } } },
      include: { channel: { include: { googleAccount: true } } },
    });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    // When the MP4 lives in the bucket, mint a fresh signed URL so the
    // frontend's <video> element never gets handed an expired link.
    const videoUrl = video.storageKey
      ? await signedUrl(video.storageKey)
      : video.videoUrl;

    const payload = {
      videoId: video.id,
      status: video.status,
      title: video.title,
      description: video.description,
      tags: video.tags,
      videoUrl,
      format: video.format,
      reviewMeta: video.reviewMeta,
      script: video.scriptMeta ?? null,
      published: video.status === 'published',
      youtubeVideoId: video.youtubeVideoId,
    };
    if (video.status === 'ready') {
      payload.canUpload = canUpload(video.channel);
      payload.uploadNote = payload.canUpload
        ? 'Rendered. Review the verdict, then approve to publish.'
        : 'Rendered. Connect a real Google channel to publish.';
    }
    res.json(payload);
  } catch (e) {
    next(e);
  }
});

// Approve a reviewed, rendered video and publish it to YouTube NOW.
router.post('/video/:id/upload', async (req, res, next) => {
  try {
    const video = await prisma.video.findFirst({
      where: { id: req.params.id, channel: { googleAccount: { userId: req.user.id } } },
    });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (video.status === 'published' || video.youtubeVideoId)
      return res
        .status(409)
        .json({ error: 'Already published', youtube: { youtubeVideoId: video.youtubeVideoId } });
    const out = await publishVideoToYouTube({ videoId: video.id });
    res.json(out);
  } catch (e) {
    next(e);
  }
});

// Approve a reviewed video and SCHEDULE it instead of uploading now. Binds
// the video to a calendar entry; the scheduler uploads at scheduledFor.
router.post('/video/:id/schedule', async (req, res, next) => {
  try {
    const { calendarEntryId } = req.body ?? {};
    if (!calendarEntryId)
      return res.status(400).json({ error: 'calendarEntryId required' });

    const video = await prisma.video.findFirst({
      where: { id: req.params.id, channel: { googleAccount: { userId: req.user.id } } },
    });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (video.status === 'published')
      return res.status(409).json({ error: 'Already published' });

    const entry = await prisma.calendarEntry.findFirst({
      where: {
        id: calendarEntryId,
        channel: { googleAccount: { userId: req.user.id } },
      },
    });
    if (!entry) return res.status(404).json({ error: 'Calendar entry not found' });

    const updated = await prisma.calendarEntry.update({
      where: { id: entry.id },
      data: { videoId: video.id, status: 'ready', autoMode: 'auto', lastError: null },
    });
    res.json({ entry: updated });
  } catch (e) {
    next(e);
  }
});

export default router;
