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

const router = Router();
router.use(requireUser);

// Re-export for the existing import in src/index.js (static /media serving).
export { MEDIA_DIR };

// Generate a viral script (spec §3). Optionally attach it to a channel as a
// Video row in `generating` status — the entry point for the BullMQ pipeline.
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
router.post('/video', async (req, res, next) => {
  try {
    const { channelId, topic, calendarEntryId = null, upload = false } = req.body ?? {};
    const format = req.body?.format === 'long' ? 'long' : 'short';
    const channel = await prisma.youtubeChannel.findFirst({
      include: { googleAccount: true },
      where: { id: channelId, googleAccount: { userId: req.user.id } },
    });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const result = await renderVideo({
      channel,
      topic,
      format,
      baseUrl,
      calendarEntryId,
    });

    let uploadNote = canUpload(channel)
      ? 'Rendered. Review the verdict, then approve to publish.'
      : 'Rendered. Connect a real Google channel to publish.';

    // Immediate-publish path: skips the human gate.
    if (upload && result.canUpload) {
      try {
        const r = await publishVideoToYouTube({ videoId: result.videoId });
        result.youtube = r.youtube;
        result.published = true;
        uploadNote = r.uploadNote;
      } catch (upErr) {
        uploadNote = `Render OK but upload failed: ${upErr.message}`;
      }
    }

    res.json({ ...result, uploadNote });
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
      data: { videoId: video.id, status: 'ready', lastError: null },
    });
    res.json({ entry: updated });
  } catch (e) {
    next(e);
  }
});

export default router;
