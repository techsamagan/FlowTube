'use client';

// Thin API client. Slice session token lives in localStorage (NextAuth.js
// replaces this in production without changing call sites).
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export function getToken() {
  return typeof window === 'undefined' ? null : localStorage.getItem('flowtube_token');
}
export function setToken(t: string) {
  localStorage.setItem('flowtube_token', t);
}
export function clearToken() {
  localStorage.removeItem('flowtube_token');
}

// Full-page redirect into the REAL Google OAuth flow. `state` carries the
// session token so the backend links the account to the logged-in user.
export function googleConnectUrl(token: string) {
  return `${BASE}/auth/google/start?state=${encodeURIComponent(token)}`;
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return res.json();
}

type Session = { token: string; user: { id: string; name: string | null; email: string } };

export const api = {
  register: (email: string, password: string, name: string) =>
    req<Session>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    req<Session>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  googleConfig: () => req<{ configured: boolean }>('/auth/google'),
  accounts: () =>
    req<{ accounts: { id: string; email: string; channelCount: number }[] }>('/accounts'),
  channels: () => req<{ channels: Channel[] }>('/channels'),
  channel: (id: string) =>
    req<{ channel: Channel & { accountEmail: string } }>(`/channels/${id}`),
  detect: () =>
    req<{ channels: Channel[]; emptyAccounts: { googleAccountId: string; email: string }[] }>(
      '/channels/detect',
      { method: 'POST' },
    ),
  aiIdentity: (niche: string) =>
    req<{ identity: Identity }>('/channels/ai-identity', {
      method: 'POST',
      body: JSON.stringify({ niche }),
    }),
  createPending: (
    googleAccountId: string,
    niche: string,
    language: string,
    identity: Identity,
  ) =>
    req<{ channel: Channel }>('/channels/create-pending', {
      method: 'POST',
      body: JSON.stringify({ googleAccountId, niche, language, identity }),
    }),
  generateScript: (niche: string, topic: string, channelId?: string) =>
    req<{ script: Script; metadata: Metadata }>('/generate/script', {
      method: 'POST',
      body: JSON.stringify({ niche, topic, channelId }),
    }),
  // Edit channel brief — description steers script generation + trend picks.
  updateChannel: (
    id: string,
    patch: { description?: string; niche?: string; language?: string },
  ) =>
    req<{ channel: Channel }>(`/channels/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  // Full real pipeline: Claude → ElevenLabs/say → Pexels → FFmpeg → AI review.
  // Does NOT upload; the user approves after seeing the verdict. Synchronous
  // on the backend (long videos take minutes), so allow a long wait.
  generateVideo: (
    channelId: string,
    topic: string,
    format: VideoFormat = 'short',
    upload = false,
    calendarEntryId: string | null = null,
  ) =>
    req<VideoResult>('/generate/video', {
      method: 'POST',
      body: JSON.stringify({ channelId, topic, format, upload, calendarEntryId }),
    }),
  // Human gate: approve a reviewed video and publish it to YouTube.
  approveUpload: (videoId: string) =>
    req<{ youtube: { youtubeVideoId: string; url: string }; uploadNote: string }>(
      `/generate/video/${videoId}/upload`,
      { method: 'POST' },
    ),
  // Approve a reviewed video but defer the upload to a calendar entry's
  // scheduledFor time. The scheduler publishes it when due.
  scheduleVideo: (videoId: string, calendarEntryId: string) =>
    req<{ entry: CalendarEntry }>(`/generate/video/${videoId}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ calendarEntryId }),
    }),
  calendar: (channelId: string) =>
    req<{ entries: CalendarEntry[] }>(`/calendar?channelId=${channelId}`),
  addCalendarEntry: (e: {
    channelId: string;
    scheduledFor: string;
    topic: string;
    format: VideoFormat;
    notes?: string;
    autoMode?: AutoMode;
  }) => req<{ entry: CalendarEntry }>('/calendar', { method: 'POST', body: JSON.stringify(e) }),
  aiCalendar: (
    channelId: string,
    days = 14,
    format: VideoFormat = 'short',
    autoMode: AutoMode = 'manual',
  ) =>
    req<{ created: number; entries: CalendarEntry[] }>('/calendar/ai-generate', {
      method: 'POST',
      body: JSON.stringify({ channelId, days, format, autoMode }),
    }),
  updateCalendarEntry: (
    id: string,
    patch: Partial<{
      scheduledFor: string;
      topic: string;
      format: VideoFormat;
      notes: string;
      autoMode: AutoMode;
    }>,
  ) =>
    req<{ entry: CalendarEntry }>(`/calendar/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  retryCalendarEntry: (id: string) =>
    req<{ entry: CalendarEntry }>(`/calendar/${id}/retry`, { method: 'POST' }),
  deleteCalendarEntry: (id: string) =>
    req<{ ok: true }>(`/calendar/${id}`, { method: 'DELETE' }),
  scanTrends: (channelId: string) =>
    req<{ scanned: number }>('/analysis/scan-trends', {
      method: 'POST',
      body: JSON.stringify({ channelId }),
    }),
  recommendations: (channelId: string) =>
    req<Recommendations>(`/analysis/recommendations?channelId=${channelId}`),
};

export type Recommendations = {
  niche: string;
  basis: { trendVideosAnalyzed: number; viralVideosFound: number; source: string; confidence: number };
  trendingNow: {
    hotHooks: { archetype: string; avgRetention: number; occurrences: number; exampleHook: string }[];
    risingTopics: { topic: string; avgRetention: number; avgViews: number; trendMomentum: number }[];
    optimalDuration: { min: number; max: number };
  };
  whatToMake: {
    rank: number;
    topic: string;
    hookArchetype: string;
    exampleHook: string;
    format: string;
    durationTarget: { min: number; max: number };
    predictedViralScore: number;
    confidence: number;
    rationale: string;
  }[];
  whenToPost: { rank: number; label: string; avgRetention: number; rationale: string }[];
  viralDNA: {
    bestHookStyles: string[];
    topPerformingTopics: string[];
    optimalDuration: { min: number; max: number };
    bestPostingTimes: string[];
    avgRetentionViral: number;
    confidenceScore: number;
    totalVideosAnalyzed: number;
    source: string;
  };
};

export type Channel = {
  id: string;
  channelId: string;
  name: string;
  handle: string | null;
  niche: string;
  language: string;
  description: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  isAiProposed: boolean;
  setupCompleted: boolean;
  aiIdentity: Identity | null;
};
export type Identity = {
  name: string;
  handle: string;
  description: string;
  avatarUrl: string;
  bannerUrl: string;
  createChannelUrl: string;
  note: string;
};
export type Script = {
  title: string;
  sections: { label: string; timecode: string; text: string }[];
  viralScore: number;
  scoreRationale: string;
  loopExplanation: string;
  estimatedDurationSec: number;
};
export type Metadata = { title: string; description: string; tags: string[] };
export type VideoFormat = 'short' | 'long';
export type Review = {
  verdict: 'pass' | 'fail';
  score: number;
  reasons: string[];
  summary: string;
};
export type VideoResult = {
  videoId: string;
  videoUrl: string;
  durationSec: number;
  format: VideoFormat;
  voiceId: string;
  keywords: string;
  music: { title: string; source: string } | null;
  captioned: boolean;
  review: Review;
  canUpload: boolean;
  published: boolean;
  youtube: { youtubeVideoId: string; url: string } | null;
  uploadNote: string;
  script: Script;
  metadata: Metadata;
};
export type AutoMode = 'manual' | 'auto';
export type EntryStatus =
  | 'planned'
  | 'generating'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'generated'; // legacy rows pre-scheduler

export type CalendarEntry = {
  id: string;
  channelId: string;
  scheduledFor: string;
  topic: string;
  format: VideoFormat;
  notes: string;
  source: 'manual' | 'ai';
  status: EntryStatus;
  autoMode: AutoMode;
  lastError: string | null;
  videoId: string | null;
};
export const FORMAT_LABELS: Record<VideoFormat, string> = {
  short: 'Short · 10–30s',
  long: 'Long · 4–10 min',
};

export const NICHES = [
  ['finance', 'Finance & Money'],
  ['motivation', 'Motivation & Mindset'],
  ['tech', 'Tech & Gadgets'],
  ['health', 'Health & Fitness'],
  ['cooking', 'Cooking & Food'],
  ['business', 'Business & Entrepreneurship'],
  ['relationships', 'Relationships & Psychology'],
  ['facts', 'Facts & Education'],
  ['luxury', 'Luxury & Lifestyle'],
  ['custom', 'Custom'],
] as const;

export const LANGUAGES = [
  'English', 'Spanish', 'Hindi', 'Portuguese', 'Arabic',
  'French', 'German', 'Russian', 'Japanese', 'Indonesian',
] as const;

export function nicheLabel(key: string) {
  return NICHES.find(([k]) => k === key)?.[1] ?? key;
}
