// Shared video pipeline used by both the synchronous /generate/video route
// and the background scheduler that fulfils auto-publish calendar entries.
//
// Two stages:
//   - renderVideo: Claude script → ElevenLabs/edge-tts voice → Pexels b-roll
//                  → music bed → FFmpeg assembly → AI quality review.
//                  Creates a Video row and returns its full payload.
//   - publishVideoToYouTube: takes a rendered Video, uploads it, marks
//                            the linked CalendarEntry published.

import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { generateScript, generateMetadata, reviewVideo, formatSpec } from './claude.js';
import { synthesizeVoiceover } from './elevenlabs.js';
import { searchBroll, downloadTo } from './pexels.js';
import { fetchMusic } from './music.js';
import { assembleVideo, generateMockClip } from './ffmpeg.js';
import { uploadShort } from './youtube.js';
import { generateBaseImage } from './imageProviders.js';
import { animateImage } from './videoProviders.js';
import {
  isStorageConfigured,
  uploadVideo,
  downloadVideo,
  signedUrl,
  videoKey,
} from './storage.js';

const STORAGE = path.join(fileURLToPath(new URL('../../storage', import.meta.url)));
export const MEDIA_DIR = path.join(STORAGE, 'media');

// Wrap an async step with timing logs. Makes wall-clock visible in Render
// logs so a future stuck render is diagnosable without redeploying just to
// add debug prints. Returns the wrapped promise's value unchanged.
async function stage(name, videoId, fn) {
  const t0 = Date.now();
  console.log(`[render ${videoId}] → ${name} start`);
  try {
    const r = await fn();
    console.log(`[render ${videoId}] ✓ ${name} ${Math.round((Date.now() - t0) / 100) / 10}s`);
    return r;
  } catch (e) {
    console.log(`[render ${videoId}] ✗ ${name} failed after ${Math.round((Date.now() - t0) / 100) / 10}s: ${e.message}`);
    throw e;
  }
}

/**
 * Generate a visual video clip for a single scene prompt by combining
 * Image generation and Video animation (Provider Factory pattern).
 */
export async function generateSceneVisual(prompt, channel) {
  const videoProvider = channel.videoProvider || 'KLING';

  // NONE = Pexels stock B-roll. The base image is unused on this path, so
  // skip the image-gen call entirely (Gemini Imagen alone is 20-40 s per
  // scene; with 3 scenes that's a full minute wasted per render).
  if (videoProvider === 'NONE') {
    const keywords = prompt.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3).slice(0, 3).join(' ') || channel.niche;
    try {
      const links = await searchBroll(keywords, 1);
      return links[0];
    } catch (e) {
      console.warn(`[videoPipeline] Pexels stock B-roll unavailable (${e.message}). Using local mock clip.`);
      return 'mock:generate';
    }
  }

  // Image-to-video providers: generate the base image, then animate it.
  const imageProvider = channel.imageProvider || 'GEMINI';
  const imageUrl = await generateBaseImage(prompt, imageProvider);
  return await animateImage(imageUrl, prompt, videoProvider);
}

// True if this channel's account can actually publish to YouTube. Mock/seed
// accounts are rejected so we never try to upload with placeholder tokens.
// Also requires a stored refresh token — a missing token means the user
// must reconnect their Google account before publishing.
export function canUpload(channel) {
  const a = channel.googleAccount;
  return Boolean(
    a?.accessToken &&
      !a.accessToken.startsWith('mock-') &&
      !a.accessToken.startsWith('seed') &&
      !String(channel.channelId).startsWith('seed') &&
      a.refreshTokenEnc, // must have a refresh token stored
  );
}

// Render-only. Creates a Video row in `ready` (or `failed`) status and
// returns the same shape the /generate/video route has always returned.
// `baseUrl` is the absolute origin used to build the public videoUrl.
export async function renderVideo({ channel, topic, format = 'short', baseUrl, calendarEntryId = null, existingVideoId = null }) {
  const fmt = format === 'long' ? 'long' : 'short';
  const spec = formatSpec(fmt);

  // existingVideoId may not exist yet — use a tag for early-stage logs.
  const logId = existingVideoId ?? 'pre-create';
  const script = await stage('script (Claude)', logId, () =>
    generateScript({
      niche: channel.niche,
      isCustomNiche: channel.isCustomNiche,
      topic,
      viralDNA: channel.viralDNA ?? undefined,
      description: channel.description || undefined,
      language: channel.language,
      format: fmt,
    }),
  );
  const metadata = await stage('metadata (Claude)', logId, () =>
    generateMetadata({ script, niche: channel.niche }),
  );

  // Either fill in the placeholder row the route created for polling, or
  // create a fresh one (scheduler path / direct callers).
  const video = existingVideoId
    ? await prisma.video.update({
        where: { id: existingVideoId },
        data: {
          script: script.fullScript,
          scriptMeta: script,
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
        },
      })
    : await prisma.video.create({
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
    const vo = await stage('voiceover', video.id, () =>
      synthesizeVoiceover({ script, seed: channel.id, outPath: voicePath }),
    );

    // 2. B-roll — generate visual clips for each scene
    const est = script.estimatedDurationSec || spec.minSec;
    const clipCount = Math.max(3, Math.min(24, Math.ceil(est / 12)));
    
    // Get visual prompts from the script
    const visualCues = script.visualCues || [];
    if (visualCues.length === 0) {
      visualCues.push(...script.sections.map((s) => s.text));
    }
    
    // Scale or pad cues to match clipCount
    const targetCues = [];
    for (let i = 0; i < clipCount; i++) {
      targetCues.push(visualCues[i % visualCues.length] || `${channel.niche} cinematic view`);
    }

    // Scene generation is the wall-clock dominator: each Kling/Veo job takes
    // 3-5 min, so processing N scenes sequentially = N × 5 min. Run them in
    // parallel batches of SCENE_CONCURRENCY instead — total time becomes
    // ceil(N/concurrency) × 5 min. Concurrency is bounded by:
    //  - provider rate limits (Kling allows ~5 concurrent jobs per account)
    //  - Render Starter memory (each in-flight scene ≈ 30-60 MB transient)
    // 3 is the sweet spot for a Short (all 3 scenes in one batch) without
    // pushing either limit.
    const SCENE_CONCURRENCY = 3;
    const brollPaths = new Array(targetCues.length);
    for (let start = 0; start < targetCues.length; start += SCENE_CONCURRENCY) {
      const batch = targetCues.slice(start, start + SCENE_CONCURRENCY);
      await stage(`scenes ${start + 1}-${start + batch.length}/${clipCount}`, video.id, () =>
        Promise.all(
          batch.map(async (cue, batchIdx) => {
            const i = start + batchIdx;
            const videoUrl = await generateSceneVisual(cue, channel);
            const brollPath = path.join(workDir, `broll${i}.mp4`);
            if (videoUrl === 'mock:generate') {
              await generateMockClip(brollPath, 5);
            } else {
              await downloadTo(videoUrl, brollPath);
            }
            brollPaths[i] = brollPath;
          }),
        ),
      );
    }

    // 3. Royalty-free music bed (Content-ID safe; null → renders no music).
    const music = await stage('music bed', video.id, () =>
      fetchMusic({
        niche: channel.niche,
        format: fmt,
        seed: channel.id,
        outPath: path.join(workDir, 'music.mp3'),
      }),
    );

    // 4. Assemble (video + strategy-driven audio mix)
    const outPath = path.join(MEDIA_DIR, `${video.id}.mp4`);
    const built = await stage('ffmpeg assemble', video.id, () =>
      assembleVideo({
        voicePath,
        musicPath: music?.path ?? null,
        brollPaths,
        sections: script.sections,
        format: fmt,
        workDir,
        outPath,
      }),
    );

    // Persist the rendered MP4 off the ephemeral container disk so a Render
    // restart between render and publish can't lose it. When the bucket isn't
    // configured we keep the legacy local-served URL — dev mode keeps working.
    let storageKey = null;
    let mediaUrl;
    if (isStorageConfigured()) {
      storageKey = videoKey(video.id);
      await stage('R2 upload', video.id, () => uploadVideo(outPath, storageKey));
      mediaUrl = await signedUrl(storageKey);
    } else {
      mediaUrl = `${baseUrl.replace(/\/$/, '')}/media/${video.id}.mp4`;
    }

    // 5. AI pre-upload quality gate — "prove it is good or not".
    const review = await stage('review (Claude)', video.id, () =>
      reviewVideo({
        script,
        metadata,
        durationSec: built.durationSec,
        format: fmt,
      }),
    );

    const updated = await prisma.video.update({
      where: { id: video.id },
      data: {
        status: 'ready',
        voiceoverUrl: mediaUrl,
        videoUrl: mediaUrl,
        storageKey,
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
      keywords: targetCues.join(', '),
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

  // Prefer the bucket copy if one exists — it survives container restarts
  // that wipe the local /storage/media file. Falls back to the local path
  // for legacy rows rendered before storage was wired up.
  const localPath = path.join(MEDIA_DIR, `${video.id}.mp4`);
  let outPath = localPath;
  let downloadedTemp = false;
  if (video.storageKey) {
    await mkdir(MEDIA_DIR, { recursive: true });
    await downloadVideo(video.storageKey, localPath);
    downloadedTemp = true;
  }

  const yt = await uploadShort({
    accessToken: video.channel.googleAccount.accessToken,
    refreshToken: video.channel.googleAccount.refreshTokenEnc,
    videoPath: outPath,
    metadata: { title: video.title, description: video.description, tags: video.tags },
    format: video.format,
  });

  // Clean up the temp download to keep disk usage bounded across many uploads
  // on the same container. Best-effort — failure here doesn't affect anything.
  if (downloadedTemp) {
    await unlink(localPath).catch(() => {});
  }

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
