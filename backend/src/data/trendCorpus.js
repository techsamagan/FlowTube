// Mock corpus of trending / viral Shorts per niche. In real mode this is
// replaced by YouTube Data API search results (services/youtube → search.list)
// scored with the YouTube Analytics API. The shape is identical so the
// analysis engine doesn't care which source produced it.

import { getNiche, NICHE_KEYS } from './niches.js';

// Hook archetypes the engine clusters on (spec: "Hook pattern" extraction).
export const HOOK_ARCHETYPES = [
  'result-first', // states the outcome before the method
  'contrarian', // challenges a widely held belief
  'shock-stat', // opens with an extreme number
  'callout', // names the viewer's behavior
  'curiosity-question', // a question that breaks an assumption
  'story-tension', // mid-action cold open
];

// Small deterministic PRNG so the corpus is stable across runs.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = (h ^ str.charCodeAt(i)) * 16777619;
  return h >>> 0;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Per-niche bias: which hook archetypes and posting windows actually overperform.
// This is what makes the extracted patterns meaningful rather than uniform noise.
const NICHE_BIAS = {
  finance: { hooks: ['shock-stat', 'contrarian'], peakDays: ['Mon', 'Tue', 'Sun'], peakHours: [7, 12, 19] },
  motivation: { hooks: ['callout', 'contrarian'], peakDays: ['Mon', 'Sun', 'Wed'], peakHours: [6, 18, 21] },
  tech: { hooks: ['result-first', 'curiosity-question'], peakDays: ['Wed', 'Thu', 'Tue'], peakHours: [9, 13, 20] },
  health: { hooks: ['contrarian', 'result-first'], peakDays: ['Mon', 'Sun', 'Sat'], peakHours: [6, 17, 20] },
  cooking: { hooks: ['story-tension', 'result-first'], peakDays: ['Fri', 'Sat', 'Sun'], peakHours: [11, 17, 19] },
  business: { hooks: ['shock-stat', 'contrarian'], peakDays: ['Tue', 'Wed', 'Mon'], peakHours: [8, 12, 21] },
  relationships: { hooks: ['callout', 'curiosity-question'], peakDays: ['Sun', 'Wed', 'Thu'], peakHours: [21, 22, 12] },
  facts: { hooks: ['shock-stat', 'curiosity-question'], peakDays: ['Sat', 'Sun', 'Fri'], peakHours: [15, 19, 21] },
  luxury: { hooks: ['shock-stat', 'story-tension'], peakDays: ['Fri', 'Sat', 'Thu'], peakHours: [13, 20, 22] },
  custom: { hooks: ['result-first', 'curiosity-question'], peakDays: ['Tue', 'Thu', 'Sun'], peakHours: [12, 18, 20] },
};

function hookText(archetype, topic) {
  switch (archetype) {
    case 'result-first':
      return `This is what ${topic} actually did in 30 days`;
    case 'contrarian':
      return `Everything you were told about ${topic} is backwards`;
    case 'shock-stat':
      return `97% of people get ${topic} completely wrong`;
    case 'callout':
      return `You're doing ${topic} for the wrong reason`;
    case 'curiosity-question':
      return `Why does ${topic} work even when it shouldn't?`;
    default:
      return `The moment ${topic} stopped working — watch`;
  }
}

/**
 * Returns ~14 trending/viral videos for a niche with realistic, biased metrics.
 * Deterministic per niche so recommendations are stable and testable.
 */
export function getTrendCorpus(niche) {
  const persona = getNiche(niche);
  const bias = NICHE_BIAS[niche] ?? NICHE_BIAS.custom;
  const topics =
    persona.topicIdeas.length > 0
      ? persona.topicIdeas
      : ['the core idea', 'the hidden cost', 'the fast method', 'the common mistake'];
  const rnd = seeded(hash(niche));
  const out = [];

  for (let i = 0; i < 14; i++) {
    const topic = topics[i % topics.length];
    // Bias ~60% of the set toward this niche's winning hooks.
    const archetype =
      rnd() < 0.6
        ? bias.hooks[i % bias.hooks.length]
        : HOOK_ARCHETYPES[Math.floor(rnd() * HOOK_ARCHETYPES.length)];
    const onPeakDay = rnd() < 0.55;
    const postedDay = onPeakDay
      ? bias.peakDays[i % bias.peakDays.length]
      : DAYS[Math.floor(rnd() * 7)];
    const onPeakHour = rnd() < 0.55;
    const postedHour = onPeakHour
      ? bias.peakHours[i % bias.peakHours.length]
      : Math.floor(rnd() * 24);

    // Videos matching the niche's winning pattern retain better & loop more.
    const patternMatch = bias.hooks.includes(archetype) && onPeakDay && onPeakHour;
    const retention = Math.round(
      (patternMatch ? 72 + rnd() * 22 : 38 + rnd() * 38) * 10,
    ) / 10;
    const loopRate = Math.round((patternMatch ? 95 + rnd() * 70 : 20 + rnd() * 60) * 10) / 10;
    const views = Math.floor((patternMatch ? 400_000 + rnd() * 4_000_000 : 8_000 + rnd() * 250_000));
    const duration = Math.round(34 + rnd() * 26); // 34–60s

    out.push({
      competitorChannelId: `UC_trend_${niche}_${i}`,
      title: hookText(archetype, topic),
      hookText: hookText(archetype, topic),
      hookArchetype: archetype,
      topic,
      duration,
      views,
      retentionEstimate: retention,
      loopRate,
      postedDay,
      postedHour,
      ageDays: 1 + Math.floor(rnd() * 21), // freshness for trend momentum
      tags: [niche, topic.split(' ')[0], 'shorts'],
      isViral: retention > 70 || loopRate > 100,
    });
  }
  return out;
}

export const ALL_NICHES = NICHE_KEYS;
export const DAY_NAMES = DAYS;
