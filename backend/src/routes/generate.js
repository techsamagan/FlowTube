import { Router } from 'express';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../lib/auth.js';
import { generateScript, generateMetadata, reviewVideo, formatSpec } from '../services/claude.js';
import { synthesizeVoiceover } from '../services/elevenlabs.js';
import { brollKeywords, searchBroll, downloadTo } from '../services/pexels.js';
import { fetchMusic } from '../services/music.js';
import { assembleVideo } from '../services/ffmpeg.js';
import { uploadShort } from '../services/youtube.js';

const router = Router();
router.use(requireUser);

const STORAGE = path.join(fileURLToPath(new URL('../../storage', import.meta.url)));
export const MEDIA_DIR = path.join(STORAGE, 'media');

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

// True if this channel's account can actually publish to YouTube.
function canUpload(channel) {
  const a = channel.googleAccount;
  return Boolean(
    a?.accessToken &&
      !a.accessToken.startsWith('mock-') &&
      !a.accessToken.startsWith('seed') &&
      !String(channel.channelId).startsWith('seed'),
  );
}

// FULL real pipeline: Claude script → ElevenLabs/say voiceover → Pexels
// B-roll → FFmpeg assembly → AI quality review. Does NOT upload: the user
// reviews the verdict and approves via POST /video/:id/upload. Pass
// upload:true only to publish immediately (skips the human gate).
router.post('/video', async (req, res, next) => {
  try {
    const { channelId, topic, upload = false } = req.body ?? {};
    const format = req.body?.format === 'long' ? 'long' : 'short';
    const spec = formatSpec(format);
    const channel = await prisma.youtubeChannel.findFirst({
      include: { googleAccount: true },
      where: { id: channelId, googleAccount: { userId: req.user.id } },
    });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const script = await generateScript({
      niche: channel.niche,
      topic,
      viralDNA: channel.viralDNA ?? undefined,
      description: channel.description || undefined,
      language: channel.language,
      format,
    });
    const metadata = await generateMetadata({ script, niche: channel.niche });

    const video = await prisma.video.create({
      data: {
        channelId: channel.id,
        script: script.fullScript,
        scriptMeta: script,
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        format,
        status: 'generating',
      },
    });

    try {
      const workDir = path.join(STORAGE, 'jobs', video.id);
      await mkdir(workDir, { recursive: true });
      await mkdir(MEDIA_DIR, { recursive: true });

      // 1. Voiceover (per-channel voice for variety)
      const voicePath = path.join(workDir, 'voice.mp3');
      const vo = await synthesizeVoiceover({ script, seed: channel.id, outPath: voicePath });

      // 2. B-roll — scale clip count with target length so long videos don't
      //    loop the same 3 clips for minutes (~1 clip / 12s, clamped).
      const est = script.estimatedDurationSec || spec.minSec;
      const clipCount = Math.max(3, Math.min(24, Math.ceil(est / 12)));
      const kw = brollKeywords(script, channel.niche).join(' ');
      const links = await searchBroll(kw, clipCount);
      const brollPaths = [];
      for (let i = 0; i < links.length; i++) {
        brollPaths.push(await downloadTo(links[i], path.join(workDir, `broll${i}.mp4`)));
      }

      // 3. Royalty-free music bed (Content-ID safe; null → renders no music).
      const music = await fetchMusic({
        niche: channel.niche,
        format,
        seed: channel.id,
        outPath: path.join(workDir, 'music.mp3'),
      });

      // 4. Assemble (video + strategy-driven audio mix)
      const outPath = path.join(MEDIA_DIR, `${video.id}.mp4`);
      const built = await assembleVideo({
        voicePath,
        musicPath: music?.path ?? null,
        brollPaths,
        sections: script.sections,
        format,
        workDir,
        outPath,
      });

      const base = `${req.protocol}://${req.get('host')}`;
      const mediaUrl = `${base}/media/${video.id}.mp4`;

      // 4. AI pre-upload quality gate — "prove it is good or not".
      const review = await reviewVideo({
        script,
        metadata,
        durationSec: built.durationSec,
        format,
      });

      // 5. Upload only if explicitly requested (immediate-publish path).
      let yt = null;
      let uploadNote = canUpload(channel)
        ? 'Rendered. Review the verdict, then approve to publish.'
        : 'Rendered. Connect a real Google channel to publish.';
      if (upload && canUpload(channel)) {
        try {
          yt = await uploadShort({
            accessToken: channel.googleAccount.accessToken,
            refreshToken: channel.googleAccount.refreshTokenEnc,
            videoPath: outPath,
            metadata,
            format,
          });
          uploadNote = `Uploaded to YouTube (${yt.url}).`;
        } catch (upErr) {
          uploadNote = `Render OK but upload failed: ${upErr.message}`;
        }
      }

      const updated = await prisma.video.update({
        where: { id: video.id },
        data: {
          status: yt ? 'published' : 'ready',
          voiceoverUrl: mediaUrl,
          videoUrl: mediaUrl,
          reviewMeta: review,
          youtubeVideoId: yt?.youtubeVideoId ?? null,
          publishedAt: yt ? new Date() : null,
        },
      });

      res.json({
        videoId: video.id,
        videoUrl: updated.videoUrl,
        durationSec: built.durationSec,
        format,
        voiceId: vo.voiceId,
        keywords: kw,
        music: music ? { title: music.title, source: music.source } : null,
        captioned: built.captioned,
        review,
        canUpload: canUpload(channel),
        published: Boolean(yt),
        youtube: yt,
        uploadNote,
        script,
        metadata,
      });
    } catch (pipeErr) {
      await prisma.video.update({
        where: { id: video.id },
        data: { status: 'failed' },
      });
      throw pipeErr;
    }
  } catch (e) {
    next(e);
  }
});

// Approve a reviewed, rendered video and publish it to YouTube. This is the
// human gate: only called after the user has seen the AI review verdict.
router.post('/video/:id/upload', async (req, res, next) => {
  try {
    const video = await prisma.video.findFirst({
      where: { id: req.params.id, channel: { googleAccount: { userId: req.user.id } } },
      include: { channel: { include: { googleAccount: true } } },
    });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (video.status === 'published' || video.youtubeVideoId)
      return res.status(409).json({ error: 'Already published', youtube: { youtubeVideoId: video.youtubeVideoId } });
    if (!canUpload(video.channel))
      return res.status(400).json({ error: 'Connect a real Google channel to publish.' });

    const outPath = path.join(MEDIA_DIR, `${video.id}.mp4`);
    const yt = await uploadShort({
      accessToken: video.channel.googleAccount.accessToken,
      refreshToken: video.channel.googleAccount.refreshTokenEnc,
      videoPath: outPath,
      metadata: { title: video.title, description: video.description, tags: video.tags },
      format: video.format,
    });
    await prisma.video.update({
      where: { id: video.id },
      data: { status: 'published', youtubeVideoId: yt.youtubeVideoId, publishedAt: new Date() },
    });
    await prisma.calendarEntry.updateMany({
      where: { videoId: video.id },
      data: { status: 'published' },
    });
    res.json({ youtube: yt, uploadNote: `Uploaded to YouTube (${yt.url}).` });
  } catch (e) {
    next(e);
  }
});

export default router;
