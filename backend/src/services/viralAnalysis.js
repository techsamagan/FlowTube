// FlowTube viral-analysis engine — "the brain" (spec §5).
//
// Pipeline:  scan trends → extract patterns → learn viral DNA →
//            recommend WHAT to make next and WHEN to post it.
//
// Every number here is explainable: recommendations carry the evidence
// (sample size, avg retention, trend momentum) that produced them.

import { prisma } from '../lib/prisma.js';
import { DAY_NAMES } from '../data/trendCorpus.js';
import { searchTrendingShorts } from './youtube.js';

const VIRAL_RETENTION = 70; // % — spec threshold
const VIRAL_LOOP = 100; // % — watched past 100% (looped)

function isViral(v) {
  return (v.retentionEstimate ?? v.retentionRate ?? 0) > VIRAL_RETENTION || (v.loopRate ?? 0) > VIRAL_LOOP;
}

// Recency weight: fresher viral videos signal a *rising* trend, not a stale one.
function momentum(ageDays) {
  return Math.max(0.25, 1 - ageDays / 30); // 1.0 today → 0.25 at a month old
}

/**
 * Scan trending/viral Shorts for the channel's niche and persist them as
 * CompetitorVideo rows. Mock corpus in mock mode; YouTube search otherwise.
 */
export async function scanTrends(channel) {
  // searchTrendingShorts decides real-vs-mock internally (YouTube API key).
  const corpus = await searchTrendingShorts(channel.niche);

  // Replace this channel's competitor snapshot.
  await prisma.competitorVideo.deleteMany({ where: { channelId: channel.id } });
  await prisma.competitorVideo.createMany({
    data: corpus.map((v) => ({
      channelId: channel.id,
      competitorChannelId: v.competitorChannelId,
      title: v.title,
      views: v.views,
      retentionEstimate: v.retentionEstimate,
      hookText: v.hookText,
      duration: v.duration,
      tags: v.tags,
    })),
  });
  return corpus;
}

/**
 * Extract viral patterns from a set of videos (the channel's own analyzed
 * videos + the trend corpus). Returns ranked hooks, topics, an optimal
 * duration band, and the best posting windows — each with confidence.
 */
export function extractPatterns(videos) {
  const viral = videos.filter(isViral);
  const denom = Math.max(viral.length, 1);

  // ── Hook archetypes ──────────────────────────────────────────────
  const hookAgg = {};
  for (const v of viral) {
    const k = v.hookArchetype ?? 'unknown';
    (hookAgg[k] ??= { occurrences: 0, retentionSum: 0, weight: 0, example: v.hookText }).occurrences++;
    hookAgg[k].retentionSum += v.retentionEstimate ?? v.retentionRate ?? 0;
    hookAgg[k].weight += momentum(v.ageDays ?? 7);
  }
  const hooks = Object.entries(hookAgg)
    .map(([archetype, a]) => ({
      archetype,
      occurrences: a.occurrences,
      avgRetention: round(a.retentionSum / a.occurrences),
      exampleHook: a.example,
      confidence: round(Math.min(1, (a.occurrences / denom) * 1.4) * (a.weight / a.occurrences)),
    }))
    .sort((x, y) => y.confidence - x.confidence);

  // ── Topics ───────────────────────────────────────────────────────
  const topicAgg = {};
  for (const v of viral) {
    const k = v.topic ?? 'general';
    (topicAgg[k] ??= { occurrences: 0, viewsSum: 0, retentionSum: 0, mo: 0 }).occurrences++;
    topicAgg[k].viewsSum += v.views ?? 0;
    topicAgg[k].retentionSum += v.retentionEstimate ?? v.retentionRate ?? 0;
    topicAgg[k].mo += momentum(v.ageDays ?? 7);
  }
  const topics = Object.entries(topicAgg)
    .map(([topic, a]) => ({
      topic,
      occurrences: a.occurrences,
      avgViews: Math.round(a.viewsSum / a.occurrences),
      avgRetention: round(a.retentionSum / a.occurrences),
      trendMomentum: round(a.mo / a.occurrences),
    }))
    .sort((x, y) => y.trendMomentum * y.avgRetention - x.trendMomentum * x.avgRetention);

  // ── Optimal duration band (interquartile of viral durations) ─────
  const durs = viral.map((v) => v.duration ?? 0).filter(Boolean).sort((a, b) => a - b);
  const durationBand = durs.length
    ? { min: durs[Math.floor(durs.length * 0.25)], max: durs[Math.floor(durs.length * 0.75)] || durs[durs.length - 1] }
    : { min: 40, max: 58 };

  // ── Best posting windows (day + hour, scored by avg retention) ───
  const winAgg = {};
  for (const v of viral) {
    if (v.postedDay == null || v.postedHour == null) continue;
    const k = `${v.postedDay}|${v.postedHour}`;
    (winAgg[k] ??= { count: 0, retentionSum: 0 }).count++;
    winAgg[k].retentionSum += v.retentionEstimate ?? v.retentionRate ?? 0;
  }
  const windows = Object.entries(winAgg)
    .map(([k, a]) => {
      const [day, hour] = k.split('|');
      return {
        day,
        hour: Number(hour),
        samples: a.count,
        avgRetention: round(a.retentionSum / a.count),
        score: round((a.retentionSum / a.count) * Math.min(1.5, 1 + a.count / 5)),
      };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 5);

  return { hooks, topics, durationBand, windows, viralCount: viral.length, total: videos.length };
}

/**
 * Build/refresh the channel's viral DNA (spec: "VIRAL DNA per channel"),
 * blending the channel's OWN viral history with the niche trend corpus
 * (the cross-channel "global brain"). Own data is weighted higher once
 * the sample is large enough; otherwise we lean on niche-wide trends.
 */
export async function refreshViralDNA(channel) {
  const own = await prisma.video.findMany({
    where: { channelId: channel.id, analytics: { isNot: null } },
    include: { analytics: true },
  });
  const ownVids = own.map((v) => ({
    hookArchetype: v.scriptMeta?.hookArchetype ?? inferArchetype(v.scriptMeta),
    topic: v.scriptMeta?.topic ?? 'general',
    duration: Math.round(v.scriptMeta?.estimatedDurationSec ?? 50),
    retentionRate: v.analytics.retentionRate,
    loopRate: v.analytics.loopRate,
    views: v.analytics.views,
    postedDay: v.publishedAt ? DAY_NAMES[v.publishedAt.getDay()] : null,
    postedHour: v.publishedAt ? v.publishedAt.getHours() : null,
    ageDays: v.publishedAt ? Math.max(1, (Date.now() - v.publishedAt) / 864e5) : 7,
  }));

  const trends = await scanTrends(channel);
  const ownConfident = ownVids.filter(isViral).length >= 5;
  // When the channel lacks its own viral history, recommendations come from
  // the niche-wide trend brain. Once it has ≥5 viral videos, its own DNA leads.
  const pool = ownConfident ? [...ownVids, ...ownVids, ...trends] : [...ownVids, ...trends];
  const p = extractPatterns(pool);

  const dna = {
    bestHookStyles: p.hooks.slice(0, 3).map((h) => h.archetype),
    bestHookWords: p.hooks.slice(0, 3).map((h) => h.exampleHook),
    optimalDuration: p.durationBand,
    bestPostingTimes: p.windows.map((w) => `${w.day} ${w.hour}:00`),
    topPerformingTopics: p.topics.slice(0, 5).map((t) => t.topic),
    avgRetentionViral: round(
      p.hooks.reduce((a, h) => a + h.avgRetention, 0) / Math.max(p.hooks.length, 1),
    ),
    loopRateViral: round(
      pool.filter(isViral).reduce((a, v) => a + (v.loopRate ?? 0), 0) /
        Math.max(pool.filter(isViral).length, 1),
    ),
    avoidPatterns: p.hooks.slice(-2).map((h) => h.archetype),
    confidenceScore: round(
      Math.min(1, p.viralCount / 12) * (ownConfident ? 1 : 0.75),
    ),
    totalVideosAnalyzed: pool.length,
    source: ownConfident ? 'channel-dna + niche-trends' : 'niche-trends (cold start)',
    lastUpdated: new Date().toISOString(),
  };

  await prisma.youtubeChannel.update({
    where: { id: channel.id },
    data: { viralDNA: dna },
  });
  return { dna, patterns: p };
}

/**
 * THE ANSWER TO "what kind of video, and when": ranked content
 * recommendations + best posting windows + a predicted viral score.
 */
export async function recommend(channel) {
  const { dna, patterns } = await refreshViralDNA(channel);

  // Tie recommendations to THIS channel's description, not just the niche:
  // re-rank trending topics by how well they match the description.
  const descWords = new Set(
    String(channel.description || '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4),
  );
  const relevance = (topic) => {
    if (descWords.size === 0) return 0;
    const tw = topic.toLowerCase().split(/\s+/);
    const hits = tw.filter((w) => descWords.has(w)).length;
    return hits / tw.length; // 0..1
  };

  const ranked = patterns.topics
    .map((t) => ({ t, rel: relevance(t.topic) }))
    .sort(
      (a, b) =>
        b.t.trendMomentum * b.t.avgRetention * (1 + 0.8 * b.rel) -
        a.t.trendMomentum * a.t.avgRetention * (1 + 0.8 * a.rel),
    )
    .slice(0, 4);

  const whatToMake = ranked.map(({ t, rel }, i) => {
    const hook = patterns.hooks[i % Math.max(patterns.hooks.length, 1)] ?? patterns.hooks[0];
    const predicted = scoreConcept({ hook, topic: t, patterns });
    const onBrand = rel > 0;
    return {
      rank: i + 1,
      topic: t.topic,
      hookArchetype: hook?.archetype ?? 'result-first',
      exampleHook: hook?.exampleHook ?? `What ${t.topic} actually does`,
      format: 'Vertical 1080×1920 Short, bold center captions, 2 re-hooks, seamless loop',
      durationTarget: patterns.durationBand,
      predictedViralScore: predicted.score,
      confidence: round(
        Math.min(1, t.trendMomentum) * (dna.confidenceScore || 0.6) * (onBrand ? 1.1 : 1),
      ),
      trendMomentum: t.trendMomentum,
      onBrand,
      rationale:
        `"${t.topic}" appears in ${t.occurrences} viral Shorts in this niche ` +
        `(avg ${t.avgRetention}% retention, ${t.avgViews.toLocaleString()} views). ` +
        `Pair with a ${hook?.archetype} hook. ` +
        (onBrand
          ? `On-brand for this channel ("${channel.description}").`
          : channel.description
            ? `Niche-trend pick; tighten toward the channel description for best fit.`
            : `Add a channel description to make picks channel-specific.`),
    };
  });

  const whenToPost = patterns.windows.map((w, i) => ({
    rank: i + 1,
    day: w.day,
    hour: w.hour,
    label: `${w.day} ${String(w.hour).padStart(2, '0')}:00`,
    avgRetention: w.avgRetention,
    score: w.score,
    rationale: `${w.samples} viral Shorts in this niche landed in this window (avg ${w.avgRetention}% retention).`,
  }));

  return {
    channelId: channel.id,
    niche: channel.niche,
    basis: {
      trendVideosAnalyzed: patterns.total,
      viralVideosFound: patterns.viralCount,
      source: dna.source,
      confidence: dna.confidenceScore,
    },
    trendingNow: {
      hotHooks: patterns.hooks.slice(0, 3),
      risingTopics: patterns.topics.slice(0, 5),
      optimalDuration: patterns.durationBand,
    },
    whatToMake,
    whenToPost,
    viralDNA: dna,
  };
}

/**
 * Predictive scoring (spec §5 "PREDICTIVE SCORING"): score a concept or a
 * generated script 1–10 by similarity to the learned winning patterns.
 */
export function scoreConcept({ hook, topic, patterns }) {
  let s = 4;
  const reasons = [];
  if (hook && patterns.hooks[0] && hook.archetype === patterns.hooks[0].archetype) {
    s += 2.5;
    reasons.push('uses the niche\'s #1 hook archetype');
  } else if (hook && patterns.hooks.slice(0, 3).some((h) => h.archetype === hook.archetype)) {
    s += 1.5;
    reasons.push('uses a top-3 hook archetype');
  }
  if (topic && patterns.topics.slice(0, 3).some((t) => t.topic === topic.topic)) {
    s += 2;
    reasons.push('targets a currently-rising topic');
  }
  s += Math.min(1.5, (topic?.trendMomentum ?? 0) * 1.5);
  return { score: Math.max(1, Math.min(10, round(s))), reasons };
}

export function scoreScript(script, dna) {
  let s = 4;
  const reasons = [];
  const txt = (script.fullScript ?? '').toLowerCase();
  if (/loop|back to|which is exactly why/.test(txt)) {
    s += 2;
    reasons.push('seamless loop detected');
  }
  const d = script.estimatedDurationSec ?? 50;
  if (dna?.optimalDuration && d >= dna.optimalDuration.min && d <= dna.optimalDuration.max) {
    s += 2;
    reasons.push(`duration ${d}s inside learned optimal band`);
  }
  if ((script.sections?.filter((x) => /RE-HOOK/i.test(x.label)).length ?? 0) >= 2) {
    s += 1.5;
    reasons.push('≥2 re-hooks');
  }
  s += Math.min(1.5, (dna?.confidenceScore ?? 0.5) * 1.5);
  return { score: Math.max(1, Math.min(10, round(s))), reasons };
}

function inferArchetype(meta) {
  const t = (meta?.title ?? '').toLowerCase();
  if (/\d+%|\bnobody\b|\bmost\b/.test(t)) return 'shock-stat';
  if (/wrong|backwards|stop/.test(t)) return 'contrarian';
  if (/why|how/.test(t)) return 'curiosity-question';
  return 'result-first';
}
function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
