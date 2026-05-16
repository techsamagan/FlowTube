import { spawn } from 'node:child_process';

// Royalty-free background music (spec: "viral sound guide").
//
// COPYRIGHT (the user explicitly flagged this): Pixabay's public API only
// serves images and videos — it has NO music/audio endpoint (confirmed in
// their docs). Trending/TikTok audio is impossible via any API and would be
// Content-ID demonetized anyway. So FlowTube SYNTHESIZES its music bed
// algorithmically with FFmpeg: a soft ambient chord pad. It is generated, not
// recorded — there is nothing for Content ID to match. 100% safe for
// monetized YouTube, no attribution, always available offline.

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (c) =>
      c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}: ${err.slice(-300)}`)),
    );
  });
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Niche → musical mood. Minor + low + spacious for dark niches; brighter
// majors for upbeat ones. Root is an absolute frequency (Hz).
const MOOD = {
  finance: { root: 146.83, minor: false },
  business: { root: 146.83, minor: false },
  motivation: { root: 164.81, minor: false },
  luxury: { root: 130.81, minor: false },
  tech: { root: 138.59, minor: true },
  health: { root: 174.61, minor: false },
  cooking: { root: 164.81, minor: false },
  relationships: { root: 130.81, minor: true },
  facts: { root: 146.83, minor: false },
  horror: { root: 98.0, minor: true },
  custom: { root: 110.0, minor: true },
};

const SEMI = (n) => Math.pow(2, n / 12);

/**
 * Generate a ~30s seamless-ish ambient pad (buildAudioMix loops it to length).
 * Deterministic per channel so each channel keeps a consistent sonic identity.
 * @returns {Promise<{path:string,title:string,source:string}|null>}
 */
export async function fetchMusic({ niche, format, seed, outPath }) {
  const m = MOOD[niche] ?? MOOD.custom;
  const h = hash(`${seed}:${niche}`);

  // Slight per-channel transpose (±2 semitones) for variety.
  const root = m.root * SEMI((h % 5) - 2);
  const third = root * (m.minor ? SEMI(3) : SEMI(4)); // minor/major 3rd
  const fifth = root * SEMI(7); // perfect 5th
  const isLong = format === 'long';

  // Long-form: slow, sparse, very low — subtle bed under a talking voice.
  // Short: a touch brighter and gently pulsing for energy.
  const tremFreq = isLong ? 0.18 : 0.55;
  const tremDepth = isLong ? 0.25 : 0.45;
  const lp = isLong ? 900 : 1500;
  const dur = 30;

  const fc =
    `[0:a][1:a][2:a]amix=inputs=3:normalize=1[ch];` +
    `[ch]tremolo=f=${tremFreq}:d=${tremDepth},` +
    `lowpass=f=${lp},` +
    `aecho=0.8:0.85:${isLong ? '90:0.35' : '55:0.25'},` +
    `afade=t=in:st=0:d=2,afade=t=out:st=${dur - 2}:d=2,` +
    `aformat=channel_layouts=stereo,volume=0.9[a]`;

  try {
    await run([
      '-y',
      '-f', 'lavfi', '-i', `sine=frequency=${root.toFixed(2)}:duration=${dur}`,
      '-f', 'lavfi', '-i', `sine=frequency=${third.toFixed(2)}:duration=${dur}`,
      '-f', 'lavfi', '-i', `sine=frequency=${fifth.toFixed(2)}:duration=${dur}`,
      '-filter_complex', fc,
      '-map', '[a]', '-ar', '44100', '-ac', '2', outPath,
    ]);
    return {
      path: outPath,
      title: `${m.minor ? 'Minor' : 'Major'} ambient pad (procedural, royalty-free)`,
      source: 'procedural',
    };
  } catch (e) {
    // Copyright-safe failure mode: no music, never a risky substitute.
    // eslint-disable-next-line no-console
    console.warn(`⚠️  Music synthesis failed (${e.message}). Rendering without music.`);
    return null;
  }
}
