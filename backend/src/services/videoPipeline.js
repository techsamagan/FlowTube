// Shared video pipeline used by both the synchronous /generate/video route
// and the background scheduler that fulfils auto-publish calendar entries.
//
// Two stages:
//   - renderVideo: Claude script → ElevenLabs/edge-tts voice → Pexels b-roll
//                  → music bed → FFmpeg assembly → AI quality review.
//                  Creates a Video row and returns its full payload.
//   - publishVideoToYouTube: takes a rendered Video, uploads it, marks
//                            the linked CalendarEntry published.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { generateScript, generateMetadata, reviewVideo, formatSpec } from './claude.js';
import { synthesizeVoiceover } from './elevenlabs.js';
import { brollKeywords, searchBroll, downloadTo } from './pexels.js';
import { fetchMusic } from './music.js';
import { assembleVideo } from './ffmpeg.js';
import { uploadShort } from './youtube.js';

const STORAGE = path.join(fileURLToPath(new URL('../../storage', import.meta.url)));
export const MEDIA_DIR = path.join(STORAGE, 'media');

// True if this channel's account can actually publish to YouTube. Mock/seed
// accounts are rejected so we never try to upload with placeholder tokens.
export function canUpload(channel) {
  const a = channel.googleAccount;
  return Boolean(
    a?.accessToken &&
      !a.accessToken.startsWith('mock-') &&
      !a.accessToken.startsWith('seed') &&
      !String(channel.channelId).startsWith('seed'),
  );
}

// Render-only. Creates a Video row in `ready` (or `failed`) status and
// returns the same shape the /generate/video route has always returned.
// `baseUrl` is the absolute origin used to build the public videoUrl.
export async function renderVideo({ channel, topic, format = 'short', baseUrl, calendarEntryId = null }) {
  const fmt = format === 'long' ? 'long' : 'short';
  const spec = formatSpec(fmt);

  const script = await generateScript({
    niche: channel.niche,
    topic,
    viralDNA: channel.viralDNA ?? undefined,
    description: channel.description || undefined,
    language: channel.language,
    format: fmt,
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
      format: fmt,
      status: 'generating',
    },
  });

  // Link to the calendar entry up-front so the entry knows about the in-progress
  // video even if a later step fails. (Fixes the prior bug where calendar rows
  // never transitioned past `planned`.)
  if (calendarEntryId) {
    await prisma.calendarEntry
      .updateMany({
        where: { id: calendarEntryId, videoId: null },
        data: { videoId: video.id },
      })
      .catch(() => {});
  }

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
      format: fmt,
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
      format: fmt,
      workDir,
      outPath,
    });

    const mediaUrl = `${baseUrl.replace(/\/$/, '')}/media/${video.id}.mp4`;

    // 5. AI pre-upload quality gate — "prove it is good or not".
    const review = await reviewVideo({
      script,
      metadata,
      durationSec: built.durationSec,
      format: fmt,
    });

    const updated = await prisma.video.update({
      where: { id: video.id },
      data: {
        status: 'ready',
        voiceoverUrl: mediaUrl,
        videoUrl: mediaUrl,
        reviewMeta: review,
      },
    });

    return {
      videoId: video.id,
      video: updated,
      videoUrl: updated.videoUrl,
      durationSec: built.durationSec,
      format: fmt,
      voiceId: vo.voiceId,
      keywords: kw,
      music: music ? { title: music.title, source: music.source } : null,
      captioned: built.captioned,
      review,
      canUpload: canUpload(channel),
      published: false,
      youtube: null,
      script,
      metadata,
    };
  } catch (pipeErr) {
    await prisma.video.update({ where: { id: video.id }, data: { status: 'failed' } });
    throw pipeErr;
  }
}

// Upload a previously-rendered Video to YouTube. Flips the Video to
// `published`, and any linked CalendarEntry too. Returns { youtube, uploadNote }.
export async function publishVideoToYouTube({ videoId }) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { channel: { include: { googleAccount: true } } },
  });
  if (!video) throw new Error('Video not found');
  if (video.youtubeVideoId) {
    return {
      youtube: { youtubeVideoId: video.youtubeVideoId, url: `https://youtu.be/${video.youtubeVideoId}` },
      uploadNote: 'Already published.',
    };
  }
  if (!canUpload(video.channel)) {
    throw new Error('Connect a real Google channel to publish.');
  }

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
    data: { status: 'published', lastError: null },
  });

  return { youtube: yt, uploadNote: `Uploaded to YouTube (${yt.url}).` };
}

// Resolve the absolute public origin for the backend. The route can compute
// this from req; the scheduler relies on env vars set by Render/Vercel.
export function publicBaseUrl() {
  return (
    process.env.PUBLIC_BACKEND_URL?.replace(/\/$/, '') ??
    process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, '') ??
    `http://localhost:${process.env.PORT ?? 4000}`
  );
}
