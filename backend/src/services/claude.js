import Anthropic from '@anthropic-ai/sdk';
import { MOCK_MODE, env } from '../env.js';
import { getNiche } from '../data/niches.js';

// ---------------------------------------------------------------------------
// The viral blueprint. This is the contract the model must follow (spec §3).
// ---------------------------------------------------------------------------
const VIRAL_BLUEPRINT = `You write 15-second viral TikTok/Reels-style YouTube Shorts. Ultra-short,
max hook energy. Every word earns its place.

HOOK STYLE: open loop — start the story, do NOT finish it until the end.
TARGET EMOTION: awe and wonder.

STRUCTURE (15s total, hard cap):
[0-2s]    HOOK — open loop. Make it impossible to scroll past. Plant a
          question/promise/mystery you only resolve in REVEAL.
[2-9s]    BUILD — deliver the awe + wonder payoff, fast. Concrete details,
          zero filler, no setup phrases ("today I'll show you" is BANNED).
[9-13s]   REVEAL — the satisfying moment. Close the loop opened in HOOK.
[13-15s]  CTA — one short punchy line.

HARD RULES:
- Max 60 words across the whole script.
- Spoken duration 13-15s at natural pace, NEVER over 15s.
- Only awe + wonder emotional tone (not shock/anger/fear).
- Insert [SCENE N] markers (numbered 1..N) one per visual moment.
- Insert [VISUAL CUE: ...] after each [SCENE N] — highly detailed,
  cinematic, optimized for image-to-video: camera (extreme close-up /
  drone shot / slow push-in), volumetric lighting, precise motion.
- Insert [TEXT POPUP: ...] markers for on-screen captions on big lines.

Return STRICT JSON only, no prose, matching this shape:
{
  "title": string,
  "sections": [{ "label": string, "timecode": string, "text": string }],
  "fullScript": string,
  "visualCues": string[],
  "textPopups": string[],
  "estimatedDurationSec": number,
  "viralScore": number,
  "scoreRationale": string,
  "loopExplanation": string
}`;

// Long-form blueprint (4-10 min). Retention-engineered like the Shorts one
// but structured for sustained watch time instead of a 58s loop.
const LONGFORM_BLUEPRINT = `You are FlowTube's elite long-form YouTube scriptwriter. You write 4-10
minute videos engineered for high average-view-duration and watch time.

SCRIPT STRUCTURE:
[0-15s]   COLD OPEN HOOK — the single most shocking result/claim. No intro,
          no "welcome back". Promise a concrete payoff and tease the ending.
[15-40s]  STAKES — why this matters now, who it's for, what they'll lose by
          not knowing. Plant an open loop you only close at the very end.
[CHAPTERS] 3-6 VALUE CHAPTERS — each opens with a micro-hook, delivers one
          self-contained idea with a concrete example/story, ends with a
          transition that pulls into the next chapter. Re-hook every 30-45s.
[CLIMAX]  The biggest payoff / counter-intuitive reveal that recontextualizes
          everything before it.
[OUTRO]   Close the opening loop, one-line takeaway, soft forward reference.

HARD RULES:
- Total spoken duration 4-10 minutes at ~150 words/min (≈600-1500 words).
- Every chapter must earn the next click; no filler, no throat-clearing.
- Open loops early, pay them off late. Pattern-interrupt every 30-45s.
- Concrete > abstract: stories, numbers, named examples.
- Insert [VISUAL CUE: ...] markers throughout. Each visual cue MUST be a highly detailed, cinematic visual prompt optimized for Image-to-Video generation models. Specify the camera angle/shot type (e.g., extreme close-up, panning drone shot), detailed volumetric lighting (e.g., moody golden hour, cyberpunk neon glow), and precise motion/actions (e.g., smoke swirling, debris slowly floating, character slowly turning head).
- Insert [TEXT POPUP: ...] markers for on-screen captions.
- Use the niche's vocabulary; avoid its forbidden patterns.
- Score the script's retention potential 1-10 before returning.

Return STRICT JSON only, no prose, matching this shape:
{
  "title": string,
  "sections": [{ "label": string, "timecode": string, "text": string }],
  "fullScript": string,
  "visualCues": string[],
  "textPopups": string[],
  "estimatedDurationSec": number,
  "viralScore": number,
  "scoreRationale": string,
  "loopExplanation": string
}`;

let client = null;
function anthropic() {
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export const FORMATS = {
  // Ultra-short viral target (13-15s). Tighter than YouTube Shorts' 60s
  // upper bound — the new VIRAL_BLUEPRINT optimizes specifically for
  // open-loop hook + awe/wonder payoff structure that fits in 15s.
  short: { label: 'Short', minSec: 13, maxSec: 16, blueprint: VIRAL_BLUEPRINT },
  long: { label: 'Long', minSec: 240, maxSec: 600, blueprint: LONGFORM_BLUEPRINT },
};
export function formatSpec(format) {
  return FORMATS[format] ?? FORMATS.short;
}

/**
 * Generate a viral Shorts script.
 * @param {{ niche:string, topic?:string, viralDNA?:object, description?:string, language?:string }} input
 */
export async function generateScript({ niche, isCustomNiche = false, topic, viralDNA, description, language, format = 'short' }) {
  const persona = getNiche(isCustomNiche ? 'custom' : niche);
  const spec = formatSpec(format);

  if (MOCK_MODE || !env.ANTHROPIC_API_KEY) {
    return mockScript({ niche, topic, persona, format, isCustomNiche });
  }

  const userPrompt = [
    `Niche: ${isCustomNiche ? niche : persona.label}`,
    isCustomNiche
      ? `This is a custom niche. You must dynamically infer the tone, pacing, and visual style based on the custom niche string: "${niche}".`
      : `Hook styles that work: ${persona.hookStyles.join('; ')}\nTone guide: ${persona.toneGuide}\nAvoid: ${persona.avoidList.join('; ')}`,
    `Target length: ${spec.label} — ${spec.minSec}-${spec.maxSec} seconds of spoken audio.`,
    description
      ? `THIS CHANNEL IS ABOUT: ${description}\nThe script MUST stay on-brand for this exact channel description — topic, angle, examples and vocabulary all derived from it.`
      : '',
    language && language.toLowerCase() !== 'english' ? `Write the script in ${language}.` : '',
    topic
      ? `Topic to cover: ${topic}`
      : description
        ? 'Choose a topic that fits THIS CHANNEL\'S description above and is high-performing for the niche.'
        : `Pick a high-performing topic from: ${persona.topicIdeas.join(', ')}`,
    viralDNA ? `This channel's learned viral DNA (bias toward it): ${JSON.stringify(viralDNA)}. Apply these proven viral patterns to the script.` : '',
    'Generate one script now. JSON only.',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await anthropic().messages.create({
    model: env.CLAUDE_MODEL,
    max_tokens: format === 'long' ? 4000 : 2000,
    system: spec.blueprint,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return parseScriptJson(text);
}

function parseScriptJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Claude did not return JSON');
  return JSON.parse(text.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Mock generator — produces a realistic, blueprint-shaped script with no key.
// ---------------------------------------------------------------------------
function mockScript({ niche, topic, persona, format = 'short', isCustomNiche = false }) {
  const subject = topic || (isCustomNiche ? niche : persona.topicIdeas[0]) || 'the thing nobody tells you';
  const hook = `Nobody believes me until they see what ${subject} actually does.`;

  if (format === 'long') {
    const chapter = (n, body, cue) => ({
      label: `CHAPTER ${n}`,
      timecode: `[ch${n}]`,
      text: `${body} [VISUAL CUE: ${cue}] [TEXT POPUP: Part ${n}]`,
    });
    const sec = [
      { label: 'COLD OPEN HOOK', timecode: '[0-15s]', text: `${hook} By the end of this you'll see exactly why — and the last part changes everything. [TEXT POPUP: Watch to the end]` },
      { label: 'STAKES', timecode: '[15-40s]', text: `Most people get ${subject} completely backwards, and it quietly costs them every single day. Here's what almost nobody explains.` },
      chapter(1, `First, the foundation: the one mechanism behind ${subject} that everything else depends on. Skip it and nothing else works.`, `extreme close-up of a vintage stopwatch ticking under dramatic golden hour light, dust motes slowly floating`),
      chapter(2, `Now the part people resist: a small, repeatable move that compounds. It feels too simple to matter — that's exactly why it works.`, `cinematic drone shot sweeping over ancient stone ruins in Greece, soft sunset glow, epic slow motion`),
      chapter(3, `Then the multiplier: stack the last two and the curve bends. Slowly, then all at once.`, `cyberpunk neon alleyway, heavy rain, reflection on wet pavement, slow camera dolly in`),
      { label: 'CLIMAX', timecode: '[climax]', text: `And here's the reveal that recontextualizes all of it: it was working the entire time — you just couldn't measure it yet. [TEXT POPUP: 🤯]` },
      { label: 'OUTRO', timecode: '[outro]', text: `Which closes the loop we opened: nobody believes me until they see what ${subject} actually does. Now you can.` },
    ];
    const fullScript = sec.map((s) => `${s.timecode} ${s.label}\n${s.text}`).join('\n\n');
    return {
      title: `The Truth About ${subject} Nobody Explains (Full Breakdown)`,
      sections: sec,
      fullScript,
      visualCues: [
        'extreme close-up of a vintage stopwatch ticking under dramatic golden hour light, dust motes slowly floating',
        'cinematic drone shot sweeping over ancient stone ruins in Greece, soft sunset glow, epic slow motion',
        'cyberpunk neon alleyway, heavy rain, reflection on wet pavement, slow camera dolly in'
      ],
      textPopups: ['Watch to the end', 'Part 1', '🤯'],
      estimatedDurationSec: 330,
      viralScore: 8,
      scoreRationale: 'Cold-open payoff promise, open loop held to the outro, micro-hook per chapter, climax recontextualizes prior chapters. (MOCK long-form)',
      loopExplanation: 'Long-form: the outro closes the cold-open loop rather than seam-looping.',
    };
  }

  const sections = [
    { label: 'HOOK', timecode: '[0-3s]', text: `${hook} [TEXT POPUP: Wait for it]` },
    { label: 'RE-HOOK #1', timecode: '[3-8s]', text: `And it's not what you think. [VISUAL CUE: extreme close-up of a vintage stopwatch ticking under dramatic golden hour light, dust motes slowly floating]` },
    { label: 'VALUE CHUNK #1', timecode: '[8-20s]', text: `Here's the first move: most people skip this and wonder why nothing changes. The ones who don't, quietly win.` },
    { label: 'RE-HOOK #2', timecode: '[20-25s]', text: `But that's the easy part. [VISUAL CUE: cyberpunk neon alleyway, heavy rain, reflection on wet pavement, slow camera dolly in] The real shift is next.` },
    { label: 'VALUE CHUNK #2', timecode: '[25-40s]', text: `When you stack it with one small habit, the curve bends. Slowly, then all at once.` },
    { label: 'CLIMAX', timecode: '[40-50s]', text: `And here's the part that breaks people's brains: it was working the whole time — they just couldn't see it yet. [TEXT POPUP: 🤯]` },
    { label: 'SEAMLESS LOOP', timecode: '[50-58s]', text: `Which is exactly why nobody believes me until they see what ${subject} actually does.` },
  ];
  const fullScript = sections.map((s) => `${s.timecode} ${s.label}\n${s.text}`).join('\n\n');
  return {
    title: `The ${subject} trick people refuse to believe`,
    sections,
    fullScript,
    visualCues: [
      'extreme close-up of a vintage stopwatch ticking under dramatic golden hour light, dust motes slowly floating',
      'cyberpunk neon alleyway, heavy rain, reflection on wet pavement, slow camera dolly in'
    ],
    textPopups: ['Wait for it', '🤯'],
    estimatedDurationSec: 54,
    viralScore: 8,
    scoreRationale:
      'Result-first hook + curiosity gap, two re-hooks within 5–7s windows, climax reframes earlier value, last line is verbatim loop back to the hook. (MOCK output)',
    loopExplanation:
      'The final sentence repeats the hook clause verbatim, so playback at loop is seamless.',
  };
}

/**
 * SEO metadata generation (spec pipeline Step 6). Mock-aware.
 */
export async function generateMetadata({ script, niche }) {
  if (MOCK_MODE || !env.ANTHROPIC_API_KEY) {
    return {
      title: script.title,
      description: `${script.title}\n\nThe one thing about ${niche} most people get wrong. Watch to the end (it loops).\n\n#shorts`,
      tags: [niche, 'shorts', 'viral', 'tips', 'mindset', 'howto', 'fyp', '2026', 'explained', 'secrets'],
    };
  }
  const res = await anthropic().messages.create({
    model: env.CLAUDE_MODEL,
    max_tokens: 600,
    system:
      'Generate SEO metadata for a YouTube Short. Curiosity-gap title (<70 chars), keyword-rich description, 15-20 tags. Return JSON {title, description, tags[]}.',
    messages: [{ role: 'user', content: `Niche: ${niche}\nScript: ${script.fullScript}` }],
  });
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return parseScriptJson(text);
}

/**
 * Pre-upload quality gate (spec: "before uploading prove it is good or not").
 * Returns a verdict the UI shows so the user approves or discards BEFORE the
 * video is published to YouTube.
 * @returns {Promise<{verdict:'pass'|'fail', score:number, reasons:string[], summary:string}>}
 */
export async function reviewVideo({ script, metadata, durationSec, format = 'short' }) {
  const spec = formatSpec(format);
  const inWindow = durationSec >= spec.minSec * 0.8 && durationSec <= spec.maxSec * 1.2;

  if (MOCK_MODE || !env.ANTHROPIC_API_KEY) {
    const reasons = [];
    if (!inWindow) reasons.push(`Rendered ${durationSec}s is outside the ${spec.label} target (${spec.minSec}-${spec.maxSec}s).`);
    if ((script.viralScore ?? 0) < 6) reasons.push(`Script viral score ${script.viralScore}/10 is below the publish bar (6).`);
    if (!metadata?.title) reasons.push('Missing SEO title.');
    const pass = reasons.length === 0;
    return {
      verdict: pass ? 'pass' : 'fail',
      score: Math.max(1, Math.min(10, Math.round((script.viralScore ?? 5) - (inWindow ? 0 : 2)))),
      reasons: pass ? ['Hook, pacing and loop structure meet the blueprint.', 'Length on target.'] : reasons,
      summary: pass ? 'Good to publish.' : 'Needs work before publishing.',
    };
  }

  const res = await anthropic().messages.create({
    model: env.CLAUDE_MODEL,
    max_tokens: 900,
    system:
      `You are FlowTube's ruthless QC reviewer. Score this ${spec.label} video on six 1-10 axes. ` +
      `Reject (verdict="fail") if ANY axis scores below 7. ` +
      `Rendered length: ${durationSec}s. Target: ${spec.minSec}-${spec.maxSec}s. ` +
      'Return STRICT JSON only:\n' +
      '{\n' +
      '  "verdict": "pass" | "fail",\n' +
      '  "score": number (1-10, average of the six axes),\n' +
      '  "scores": {\n' +
      '    "hookStrength": number (1-10),\n' +
      '    "emotionClarity": number (1-10),\n' +
      '    "pacing": number (1-10),\n' +
      '    "sync": number (1-10),\n' +
      '    "captions": number (1-10),\n' +
      '    "payoff": number (1-10)\n' +
      '  },\n' +
      '  "viralPrediction": "low" | "medium" | "high" | "viral",\n' +
      '  "reasons": string[],\n' +
      '  "summary": string\n' +
      '}',
    messages: [
      {
        role: 'user',
        content: `Rendered length: ${durationSec}s\nSEO title: ${metadata?.title}\nTags: ${(metadata?.tags ?? []).join(', ')}\nScript:\n${script.fullScript}`,
      },
    ],
  });
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const parsed = parseScriptJson(text);
  const scores = parsed.scores ?? {};
  const numericScores = Object.values(scores).filter((v) => typeof v === 'number');
  const minScore = numericScores.length ? Math.min(...numericScores) : Number(parsed.score ?? 0);
  // Enforce the "any axis <7 → fail" rule server-side too, in case the model
  // ignores it on a given run.
  const verdict = minScore >= 7 && parsed.verdict === 'pass' ? 'pass' : 'fail';
  return {
    verdict,
    score: Number(parsed.score ?? 0),
    scores,
    viralPrediction: String(parsed.viralPrediction ?? 'unknown'),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
    summary: String(parsed.summary ?? ''),
  };
}
