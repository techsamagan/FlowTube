import { createReadStream } from 'node:fs';
import { google } from 'googleapis';
import { MOCK_MODE, env } from '../env.js';
import { getNiche } from '../data/niches.js';
import { decrypt } from '../lib/crypto.js';

/**
 * Upload a rendered MP4 to the channel's YouTube as a Short (spec Step 7).
 * Requires the channel's real OAuth tokens (youtube.upload scope).
 * @returns {Promise<{youtubeVideoId:string, url:string}>}
 */
export async function uploadShort({ accessToken, refreshToken, videoPath, metadata, format = 'short' }) {
  if (!accessToken || accessToken.startsWith('mock-') || accessToken.startsWith('seed')) {
    throw new Error('Upload needs a real OAuth-connected channel');
  }
  const auth = oauthClient();
  // The stored access token is short-lived (~1h). Seeding it would make
  // google-auth-library treat it as valid (no expiry_date) and skip the
  // refresh → 401 "Invalid Credentials". Set ONLY the refresh token and
  // force a fresh access token from it before uploading.
  auth.setCredentials({ refresh_token: decrypt(refreshToken) });
  try {
    const { token } = await auth.getAccessToken();
    if (!token) throw new Error('no access token returned');
  } catch (e) {
    throw new Error(`YouTube token refresh failed: ${e.message}`);
  }
  const yt = google.youtube({ version: 'v3', auth });

  // #Shorts in title/description is what flags a vertical <60s video as a
  // Short. Long-form videos must NOT carry it (and aren't /shorts/ URLs).
  const isShort = format !== 'long';
  const title = isShort
    ? `${(metadata.title ?? 'Untitled').slice(0, 95)} #Shorts`
    : (metadata.title ?? 'Untitled').slice(0, 100);
  const description = isShort
    ? `${metadata.description ?? ''}\n\n#Shorts`.trim()
    : (metadata.description ?? '').trim();

  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description,
        tags: (metadata.tags ?? []).slice(0, 20),
        categoryId: '22', // People & Blogs
      },
      status: {
        // Automated upload → default to private; the operator publishes/schedules.
        privacyStatus: 'private',
        selfDeclaredMadeForKids: false,
      },
    },
    media: { body: createReadStream(videoPath) },
  });
  const id = res.data.id;
  return {
    youtubeVideoId: id,
    url: isShort
      ? `https://www.youtube.com/shorts/${id}`
      : `https://www.youtube.com/watch?v=${id}`,
  };
}

// IMPORTANT REALITY (documented in README): YouTube Data API v3 has NO
// channels.insert, and channel avatars/banners are READ-ONLY via the API.
// We therefore cannot programmatically create a channel or set its picture.
// Instead, when an account has no channel we AI-generate an identity
// (name/handle/description + an avatar image) and hand the user a one-time
// guided manual-create link. Branding text we CAN push later via channels.update.

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

export function oauthClient() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

export function googleAuthUrl(state) {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  });
}

/**
 * Detect YouTube channels owned by the authenticated Google account.
 * Returns [] when the account has zero channels.
 */
export async function detectChannels({ accessToken, refreshToken }) {
  // Real Google OAuth only — no demo accounts. An account with no usable
  // token simply has no detectable channels.
  if (!accessToken) return [];
  const auth = oauthClient();
  // refreshToken arrives encrypted (AES-GCM); decrypt for the OAuth client.
  // googleapis auto-refreshes the access token from it when expired.
  auth.setCredentials({
    access_token: accessToken,
    refresh_token: decrypt(refreshToken),
  });
  const yt = google.youtube({ version: 'v3', auth });
  const res = await yt.channels.list({
    part: ['snippet', 'statistics', 'status', 'brandingSettings'],
    mine: true,
  });
  const items = res.data.items ?? [];
  return items.map((c) => ({
    channelId: c.id,
    name: c.snippet?.title ?? 'Untitled',
    handle: c.snippet?.customUrl ?? null,
    avatarUrl: c.snippet?.thumbnails?.high?.url ?? null,
    subscriberCount: Number(c.statistics?.subscriberCount ?? 0),
    videoCount: Number(c.statistics?.videoCount ?? 0),
    viewCount: Number(c.statistics?.viewCount ?? 0),
    language: c.snippet?.defaultLanguage ?? c.snippet?.country ?? 'Unknown',
    description: c.snippet?.description ?? '',
  }));
}

function avatarFor(seed) {
  // Deterministic generated artwork. In real mode this is replaced by an
  // image-model call; the API still cannot push it to YouTube automatically.
  return `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed)}`;
}

/**
 * Search trending Shorts for a niche (spec §5 "COMPETITOR ANALYSIS").
 * Real mode: YouTube Data API search.list (most-viewed recent short videos),
 * then statistics for view counts. Retention isn't exposed for other people's
 * videos, so it's estimated from like/comment-to-view ratios. Mock mode uses
 * the deterministic trend corpus.
 */
export async function searchTrendingShorts(niche) {
  // Public search → a YouTube Data API key is enough (no per-user OAuth).
  // Never silently mock in real mode: warn loudly if the key is missing.
  if (MOCK_MODE || !env.YOUTUBE_API_KEY) {
    if (!MOCK_MODE && !env.YOUTUBE_API_KEY) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  Real mode but YOUTUBE_API_KEY missing — trend search using mock corpus.');
    }
    const { getTrendCorpus } = await import('../data/trendCorpus.js');
    return getTrendCorpus(niche);
  }
  const yt = google.youtube({ version: 'v3', auth: env.YOUTUBE_API_KEY });
  const search = await yt.search.list({
    part: ['snippet'],
    q: `${niche} #shorts`,
    type: ['video'],
    videoDuration: 'short',
    order: 'viewCount',
    maxResults: 25,
    publishedAfter: new Date(Date.now() - 30 * 864e5).toISOString(),
  });
  const ids = (search.data.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
  const stats = await yt.videos.list({ part: ['statistics', 'contentDetails', 'snippet'], id: ids });
  return (stats.data.items ?? []).map((v) => {
    const views = Number(v.statistics?.viewCount ?? 0);
    const eng = (Number(v.statistics?.likeCount ?? 0) + Number(v.statistics?.commentCount ?? 0)) / Math.max(views, 1);
    const published = new Date(v.snippet?.publishedAt ?? Date.now());
    return {
      competitorChannelId: v.snippet?.channelId ?? 'unknown',
      title: v.snippet?.title ?? '',
      hookText: v.snippet?.title ?? '',
      hookArchetype: 'unknown', // classified downstream from the title
      topic: niche,
      duration: 45,
      views,
      retentionEstimate: Math.min(95, 45 + eng * 800), // proxy — see docstring
      loopRate: Math.min(180, eng * 1600),
      postedDay: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][published.getDay()],
      postedHour: published.getHours(),
      ageDays: Math.max(1, (Date.now() - published.getTime()) / 864e5),
      tags: v.snippet?.tags ?? [niche],
    };
  });
}

/**
 * AI-generate a full channel identity for an account that has no channel.
 * (spec: "AI-generated guided setup")
 */
export function generateChannelIdentity({ niche }) {
  const persona = getNiche(niche);
  const base = persona.label.split(' ')[0];
  const name = `${base} Unfiltered`;
  const handle = `@${base.toLowerCase()}unfiltered`;
  return {
    name,
    handle,
    description: `Daily ${persona.label} Shorts. ${persona.toneGuide} New drop every day — watch till it loops.`,
    keywords: persona.topicIdeas,
    avatarPrompt: `Bold minimal logo for a ${persona.label} YouTube Shorts channel, high contrast, dark background, electric blue accent`,
    avatarUrl: avatarFor(name),
    bannerUrl: `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(name + '-banner')}`,
    // One-time human step — the only way a channel can actually be created.
    createChannelUrl: 'https://www.youtube.com/create_channel',
    note:
      'YouTube has no API to create a channel or set its avatar. Create the channel once with the suggested identity above; FlowTube auto-syncs the rest.',
  };
}
