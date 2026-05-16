import { writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { env, MOCK_MODE } from '../env.js';

// ElevenLabs voiceover (spec pipeline Step 2). Free accounts can only use
// PREMADE voices via the API (library/legacy voices → HTTP 402), so we fetch
// the account's voice list and pick a premade one — a different voice per
// channel/niche for variety (spec: "Different voice per niche/channel").

const API = 'https://api.elevenlabs.io/v1';
let _premade = null; // cached [{voice_id,name}]

async function premadeVoices() {
  if (_premade) return _premade;
  const r = await fetch(`${API}/voices`, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } });
  if (!r.ok) throw new Error(`ElevenLabs /voices failed: ${r.status}`);
  const d = await r.json();
  _premade = (d.voices ?? []).filter((v) => v.category === 'premade');
  if (_premade.length === 0) throw new Error('No premade ElevenLabs voices available on this account');
  return _premade;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic premade voice for a channel/niche so each channel has its own. */
export async function pickVoiceId(seed) {
  const voices = await premadeVoices();
  return voices[hash(String(seed)) % voices.length].voice_id;
}

/** Strip editor/caption markers so only spoken words are sent to TTS. */
export function spokenText(script) {
  const raw = script.sections?.map((s) => s.text).join(' ') ?? script.fullScript ?? '';
  return raw
    .replace(/\[(VISUAL CUE|TEXT POPUP)[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sh(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${bin} exited ${code}: ${err.slice(-300)}`)),
    );
  });
}

// ── Microsoft Edge Neural TTS (edge-tts) ─────────────────────────────────
// Free, no API key, no quota — real Azure neural voices. This is the
// primary fallback when ElevenLabs is unavailable; far more human than the
// robotic macOS `say`. Installed via pipx (~/.local/bin not on the server
// PATH, so resolve the binary explicitly).
const EDGE_BIN = ['edge-tts', path.join(homedir(), '.local/bin/edge-tts')].find(
  (p) => p === 'edge-tts' || existsSync(p),
);

// Curated modern, natural-sounding English neural voices. Deterministic
// pick per channel so each channel keeps its own consistent voice.
const EDGE_VOICES = [
  'en-US-AndrewNeural', // warm, conversational male
  'en-US-BrianNeural', // casual male
  'en-US-GuyNeural', // confident male
  'en-US-AriaNeural', // natural female
  'en-US-EmmaNeural', // friendly female
  'en-US-JennyNeural', // smooth female
  'en-GB-RyanNeural', // British male
  'en-GB-SoniaNeural', // British female
];

let _edgeOk = null;
async function edgeAvailable() {
  if (_edgeOk !== null) return _edgeOk;
  try {
    await sh(EDGE_BIN ?? 'edge-tts', ['--version']);
    _edgeOk = true;
  } catch {
    _edgeOk = false;
  }
  return _edgeOk;
}

/** Realistic, free voiceover via Edge neural TTS (writes MP3 directly). */
async function synthesizeWithEdge({ text, seed, outPath }) {
  const voice = EDGE_VOICES[hash(String(seed)) % EDGE_VOICES.length];
  const txtFile = outPath.replace(/\.mp3$/, '') + '.txt';
  await writeFile(txtFile, text);
  await sh(EDGE_BIN ?? 'edge-tts', [
    '--voice', voice,
    '--file', txtFile,
    '--write-media', outPath,
  ]);
  return { path: outPath, voiceId: `edge:${voice}`, chars: text.length, engine: 'edge-tts' };
}

/**
 * Free fallback chain: realistic Edge neural TTS first, robotic macOS `say`
 * only if edge-tts is unavailable so a video is always produced.
 */
async function synthesizeFree({ text, seed, outPath }) {
  if (await edgeAvailable()) {
    try {
      return await synthesizeWithEdge({ text, seed, outPath });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`⚠️  edge-tts failed (${e.message}). Falling back to 'say'.`);
    }
  }
  return synthesizeWithSay({ text, seed, outPath });
}

/** macOS English voices, parsed once from `say -v '?'`. */
let _sayVoices = null;
async function sayVoices() {
  if (_sayVoices) return _sayVoices;
  try {
    const list = await sh('say', ['-v', '?']);
    _sayVoices = list
      .split('\n')
      .filter((l) => /\sen[_-]/.test(l))
      .map((l) => l.split(/\s{2,}/)[0].trim())
      .filter(Boolean);
  } catch {
    _sayVoices = [];
  }
  return _sayVoices;
}

/**
 * Free offline fallback when ElevenLabs is unavailable (no key / quota
 * exceeded). Uses the macOS `say` engine → AIFF, then FFmpeg → MP3 so the
 * rest of the pipeline is unchanged. Deterministic voice per channel.
 */
async function synthesizeWithSay({ text, seed, outPath }) {
  const voices = await sayVoices();
  const voice = voices.length ? voices[hash(String(seed)) % voices.length] : null;
  const aiff = outPath.replace(/\.mp3$/, '') + '.aiff';
  await sh('say', [...(voice ? ['-v', voice] : []), '-o', aiff, '--', text]);
  // AIFF → MP3 (FFmpeg is already a hard dependency of the assembly step).
  await sh('ffmpeg', ['-y', '-i', aiff, '-codec:a', 'libmp3lame', '-q:a', '4', outPath]);
  return { path: outPath, voiceId: voice ? `say:${voice}` : 'say:default', chars: text.length, engine: 'say' };
}

/**
 * Synthesize voiceover to an MP3 file. Tries ElevenLabs first; on missing key,
 * mock mode, or any ElevenLabs failure (e.g. quota_exceeded) it falls back to
 * the free offline `say` engine so a video is always produced.
 * Returns { path, voiceId, chars, engine }.
 */
export async function synthesizeVoiceover({ script, seed, outPath }) {
  const text = spokenText(script);
  if (!text) throw new Error('Script has no spoken text');

  if (MOCK_MODE || !env.ELEVENLABS_API_KEY) {
    return synthesizeFree({ text, seed, outPath });
  }

  try {
    const voiceId = await pickVoiceId(seed);
    const res = await fetch(`${API}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`ElevenLabs TTS ${res.status}: ${detail.slice(0, 200)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(outPath, buf);
    return { path: outPath, voiceId, chars: text.length, engine: 'elevenlabs' };
  } catch (e) {
    // ElevenLabs down/quota → don't fail the whole render; use the free
    // realistic Edge neural voice (then `say` only as a last resort).
    // eslint-disable-next-line no-console
    console.warn(`⚠️  ElevenLabs failed (${e.message}). Falling back to free Edge neural TTS.`);
    return synthesizeFree({ text, seed, outPath });
  }
}
