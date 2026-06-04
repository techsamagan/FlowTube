import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// FFmpeg video assembly (spec pipeline Step 4): 1080x1920 vertical Short,
// B-roll synced to the voiceover length, bold burned captions.

function run(bin, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd });
    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}: ${err.slice(-500)}`)),
    );
  });
}

// Whether this FFmpeg build has the `subtitles` filter (needs libass).
// Stripped builds (e.g. some Homebrew bottles) omit it — we then render
// without burned captions rather than hard-failing the whole pipeline.
let _hasSubtitles = null;
function hasSubtitlesFilter() {
  if (_hasSubtitles !== null) return Promise.resolve(_hasSubtitles);
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-filters']);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('error', () => resolve((_hasSubtitles = false)));
    p.on('close', () => resolve((_hasSubtitles = / subtitles /.test(out))));
  });
}

export function probeDuration(file) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('error', reject);
    p.on('close', () => {
      const d = parseFloat(out.trim());
      Number.isFinite(d) && d > 0 ? resolve(d) : reject(new Error('ffprobe: no duration'));
    });
  });
}

function ts(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

// One caption per script section, timed proportionally to its text length.
export async function buildSrt(sections, totalSec, srtPath) {
  const clean = sections.map((s) =>
    s.text.replace(/\[(VISUAL CUE|TEXT POPUP)[^\]]*\]/gi, '').replace(/\s+/g, ' ').trim(),
  );
  const lens = clean.map((t) => Math.max(t.length, 1));
  const sum = lens.reduce((a, b) => a + b, 0);
  let t = 0;
  const blocks = clean.map((text, i) => {
    const dur = (lens[i] / sum) * totalSec;
    const start = t;
    t += dur;
    return `${i + 1}\n${ts(start)} --> ${ts(Math.min(t, totalSec))}\n${text}\n`;
  });
  await writeFile(srtPath, blocks.join('\n'));
  return srtPath;
}

// LOW_MEMORY mode targets containers that can't fit the rich 1080x1920
// pipeline + libass + loudnorm in their RAM budget (the classic case:
// Render Starter at 512 MB). Auto-on when either:
//   - container RAM <1 GB per os.totalmem() (works when cgroup is exposed),
//   - OR the RENDER env var is set (Render Starter doesn't expose cgroup,
//     so os.totalmem() lies; the env var is the only reliable signal).
// LOW_MEMORY=true|false explicitly overrides both auto-checks.
const LOW_MEM = (() => {
  if (process.env.LOW_MEMORY === 'true') return true;
  if (process.env.LOW_MEMORY === 'false') return false;
  const totalGB = os.totalmem() / (1024 * 1024 * 1024);
  if (totalGB < 1) return true;
  if (process.env.RENDER === 'true') return true;
  return false;
})();
if (LOW_MEM) {
  // eslint-disable-next-line no-console
  console.log(`[ffmpeg] LOW_MEMORY mode active (totalmem=${(os.totalmem() / 1024 / 1024).toFixed(0)} MB, RENDER=${process.env.RENDER ?? 'unset'})`);
}
// 540x960 is half-HD vertical — still 9:16, still legal for YouTube Shorts,
// uses ~25% of the per-frame buffer memory of 1080x1920.
const VIDEO_W = LOW_MEM ? 540 : 1080;
const VIDEO_H = LOW_MEM ? 960 : 1920;

const NORM =
  `scale=${VIDEO_W}:${VIDEO_H}:force_original_aspect_ratio=increase,` +
  `crop=${VIDEO_W}:${VIDEO_H},fps=30,setsar=1`;

// Format-aware audio strategy (the "viral sound guide"):
//  short → punchy whoosh on every cut, music a touch louder.
//  long  → subtle riser on cuts, music quiet under the voice.
// Viral spec: music at 25% of voice. Previous 16% was too quiet to register
// emotionally; 25% sits under the voice without competing with it.
const AUDIO = {
  short: { musicVol: 0.25, sfxVol: 0.5, sfx: 'whoosh' },
  long: { musicVol: 0.12, sfxVol: 0.28, sfx: 'riser' },
};

// Synthesize a copyright-free transition SFX with FFmpeg's own generators
// (zero external assets, zero Content-ID risk).
async function synthSfx(kind, outPath) {
  if (kind === 'riser') {
    // ~1.3s noise riser that swells then drops — subtle long-form segue.
    await run('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'anoisesrc=d=1.3:c=brown:a=0.5',
      '-af', 'highpass=f=200,lowpass=f=6000,afade=t=in:st=0:d=1.0,afade=t=out:st=1.1:d=0.2,volume=1.2',
      '-ar', '44100', '-ac', '2', outPath,
    ]);
  } else {
    // ~0.3s pink-noise whoosh with a fast in/out — punchy Shorts cut.
    await run('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'anoisesrc=d=0.3:c=pink:a=0.7',
      '-af', 'bandpass=f=1800:width_type=h:w=2400,afade=t=in:st=0:d=0.04,afade=t=out:st=0.12:d=0.18',
      '-ar', '44100', '-ac', '2', outPath,
    ]);
  }
  return outPath;
}

/**
 * Build the final audio track per the sound strategy:
 *  1. trim leading silence so the voice hits at 0:00 (no dead-air start),
 *  2. duck a royalty-free music bed under the voice (sidechain),
 *  3. drop a transition SFX on every B-roll cut,
 *  4. loudness-normalize the whole mix to YouTube's -14 LUFS.
 * Returns the path to the finished audio, and the post-trim duration.
 * Falls back to a clean, normalized voice-only track if the rich mix fails,
 * so a video is always produced.
 */
async function buildAudioMix({ voicePath, musicPath, cutTimes, format, workDir }) {
  const a = AUDIO[format] ?? AUDIO.short;

  // (1) De-silence the head of the voiceover and standardize the format.
  const voice = path.join(workDir, 'voice_clean.wav');
  await run('ffmpeg', [
    '-y', '-i', voicePath,
    '-af',
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,' +
      'aresample=44100,aformat=channel_layouts=stereo',
    voice,
  ]);
  const Dc = await probeDuration(voice);
  const audioFinal = path.join(workDir, 'audio_final.m4a');

  // LOW_MEMORY skips the heavy audio mix (sidechain + loudnorm). It encodes
  // straight to AAC with a simple volume mix — same memory footprint as the
  // current fallback. Voice ducking is approximated by lowering music volume
  // even further (no sidechain compressor needed).
  if (LOW_MEM) {
    if (musicPath) {
      await run('ffmpeg', [
        '-y', '-i', voice,
        '-stream_loop', '-1', '-i', musicPath,
        '-filter_complex',
        `[1:a]volume=${a.musicVol * 0.6},atrim=0:${Dc.toFixed(2)}[mt];` +
          `[0:a][mt]amix=inputs=2:normalize=0[aout]`,
        '-map', '[aout]', '-t', Dc.toFixed(2),
        '-c:a', 'aac', '-b:a', '128k', audioFinal,
      ]);
    } else {
      await run('ffmpeg', [
        '-y', '-i', voice,
        '-c:a', 'aac', '-b:a', '128k', audioFinal,
      ]);
    }
    return { path: audioFinal, durationSec: Dc };
  }

  try {
    // (3) SFX bed: a full-length silent base with the SFX dropped on each cut.
    const events = cutTimes.filter((t) => t > 0.1 && t < Dc - 0.1).slice(0, 12);
    let sfxBed = null;
    if (events.length) {
      const sfx = await synthSfx(a.sfx, path.join(workDir, 'sfx.wav'));
      const splits = events.map((_, i) => `[s${i}]`).join('');
      const delays = events
        .map((t, i) => {
          const ms = Math.round(t * 1000);
          return `[s${i}]adelay=${ms}|${ms}[d${i}]`;
        })
        .join(';');
      const mixIns = ['[base]', ...events.map((_, i) => `[d${i}]`)].join('');
      sfxBed = path.join(workDir, 'sfx_bed.wav');
      await run('ffmpeg', [
        '-y',
        '-f', 'lavfi', '-t', Dc.toFixed(2), '-i', 'anullsrc=r=44100:cl=stereo',
        '-i', sfx,
        '-filter_complex',
        `[1:a]asplit=${events.length}${splits};${delays};` +
          `[0:a]anull[base];${mixIns}amix=inputs=${events.length + 1}:normalize=0[a]`,
        '-map', '[a]', '-t', Dc.toFixed(2), sfxBed,
      ]);
    }

    // (2)+(4) voice + ducked music + sfx → loudnorm.
    const inputs = ['-i', voice];
    let fc = '[0:a]asplit=2[v1][v2];';
    const mixParts = ['[v1]'];
    let idx = 1;
    if (musicPath) {
      inputs.push('-stream_loop', '-1', '-i', musicPath);
      const mi = idx++;
      fc +=
        `[${mi}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${Dc.toFixed(2)},` +
        `volume=${a.musicVol}[mt];` +
        '[mt][v2]sidechaincompress=threshold=0.02:ratio=8:attack=5:release=250[md];';
      mixParts.push('[md]');
    } else {
      fc += '[v2]anull[vn];'; // keep v2 consumed
      mixParts.push('[vn]');
    }
    if (sfxBed) {
      inputs.push('-i', sfxBed);
      const si = idx++;
      fc += `[${si}:a]volume=${a.sfxVol}[sf];`;
      mixParts.push('[sf]');
    }
    fc +=
      `${mixParts.join('')}amix=inputs=${mixParts.length}:normalize=0,` +
      'loudnorm=I=-14:TP=-1.5:LRA=11[aout]';
    await run('ffmpeg', [
      '-y', ...inputs,
      '-filter_complex', fc,
      '-map', '[aout]', '-t', Dc.toFixed(2),
      '-c:a', 'aac', '-b:a', '192k', audioFinal,
    ]);
    return { path: audioFinal, durationSec: Dc };
  } catch (e) {
    // Copyright-safe, always-ships fallback: clean + normalized voice only.
    // eslint-disable-next-line no-console
    console.warn(`⚠️  Rich audio mix failed (${e.message}). Using clean voice-only audio.`);
    await run('ffmpeg', [
      '-y', '-i', voice,
      '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
      '-c:a', 'aac', '-b:a', '192k', audioFinal,
    ]);
    return { path: audioFinal, durationSec: Dc };
  }
}

/**
 * Assemble the final video.
 * @param {{voicePath:string, musicPath?:string, brollPaths:string[], sections:object[], format?:string, workDir:string, outPath:string, onSubstage?:(stage:string,ms:number,ok:boolean,err?:string)=>void}} a
 */
export async function assembleVideo({
  voicePath,
  musicPath = null,
  brollPaths,
  sections,
  format = 'short',
  workDir,
  outPath,
  onSubstage = null,
}) {
  // Helper to wall-clock a sub-step. Drops a hook (onSubstage) for the caller
  // to persist into Video.stagesLog so a stuck ffmpeg call is diagnosable
  // without log dashboard access.
  const sub = async (name, fn) => {
    const t0 = Date.now();
    try {
      const r = await fn();
      const ms = Date.now() - t0;
      console.log(`[ffmpeg] ${name} ${(ms / 1000).toFixed(1)}s`);
      onSubstage?.(name, ms, true);
      return r;
    } catch (e) {
      const ms = Date.now() - t0;
      console.log(`[ffmpeg] ${name} FAILED after ${(ms / 1000).toFixed(1)}s: ${e.message}`);
      onSubstage?.(name, ms, false, e.message?.slice(0, 200));
      throw e;
    }
  };
  const D = await probeDuration(voicePath);
  const n = brollPaths.length;
  const per = Math.max(D / n, 2);

  // 1. Normalize each B-roll clip to a uniform segment of `per` sec
  //    (looping clips shorter than `per`).
  const segs = await sub(`normalize ${n} segs`, async () => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const seg = path.join(workDir, `seg${i}.mp4`);
      await run('ffmpeg', [
        '-y', '-stream_loop', '-1', '-i', brollPaths[i],
        '-t', per.toFixed(2), '-an',
        '-vf', NORM, '-r', '30',
        '-c:v', 'libx264', '-preset', process.env.FFMPEG_PRESET ?? 'ultrafast', '-pix_fmt', 'yuv420p',
        seg,
      ]);
      out.push(seg);
    }
    return out;
  });

  // 2. Concat segments.
  await sub('concat', async () => {
    const listFile = path.join(workDir, 'concat.txt');
    await writeFile(listFile, segs.map((s) => `file '${s}'`).join('\n'));
    const broll = path.join(workDir, 'broll.mp4');
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', broll]);
  });

  // 3. Build the strategy-driven audio track.
  const cutTimes = [];
  for (let t = per; t < D; t += per) cutTimes.push(t);
  const audio = await sub('audio mix', () =>
    buildAudioMix({ voicePath, musicPath, cutTimes, format, workDir }),
  );
  const Dc = audio.durationSec; // post-silence-trim length drives everything

  // 4. Mux video + the finished audio, looped/trimmed to the audio length,
  //    burning captions when (a) this FFmpeg build has libass, AND (b) the
  //    host hasn't opted out via SKIP_CAPTIONS or LOW_MEMORY. Caption burning
  //    re-runs libass + a re-encode for every frame — the CPU/memory killer
  //    on Render Starter (0.5 vCPU / 512 MB).
  const captioned =
    process.env.SKIP_CAPTIONS !== 'true' &&
    !LOW_MEM &&
    (await hasSubtitlesFilter());
  const args = [
    '-y', '-stream_loop', '-1', '-i', 'broll.mp4', '-i', audio.path,
    '-t', Dc.toFixed(2),
  ];
  if (captioned) {
    await buildSrt(sections, Dc, path.join(workDir, 'captions.srt'));
    // Viral spec: Arial Bold 52 px white with black stroke. Fontsize 52 is
    // libass-relative — at our 1080x1920 canvas this lands roughly the
    // same eye-size as Reels native captions.
    args.push(
      '-vf',
      "subtitles=captions.srt:force_style='Fontname=Arial,Fontsize=52,Bold=1," +
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1," +
        "Outline=4,Shadow=0,Alignment=2,MarginV=280'",
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "⚠️  FFmpeg has no 'subtitles' filter (libass missing) — rendering " +
        'without burned captions. `brew install ffmpeg` to enable them.',
    );
  }
  // When NOT burning captions we can skip the video re-encode entirely —
  // broll.mp4 is already libx264/yuv420p/30fps from step 1. That turns the
  // final mux from "decode-encode every frame" into a stream copy: instant.
  if (captioned) {
    args.push(
      '-c:v', 'libx264', '-preset', process.env.FFMPEG_PRESET ?? 'ultrafast',
      '-pix_fmt', 'yuv420p',
    );
  } else {
    args.push('-c:v', 'copy');
  }
  args.push(
    '-map', '0:v', '-map', '1:a',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', outPath,
  );
  await sub(`final mux ${captioned ? '(captions)' : '(copy)'}`, () =>
    run('ffmpeg', args, workDir),
  );

  return {
    path: outPath,
    durationSec: Math.round(Dc),
    captioned,
    hasMusic: Boolean(musicPath),
  };
}

/**
 * Generate a placeholder video clip using FFmpeg's built-in lavfi source.
 * Used in mock/no-key mode so we never hit external URLs that may 403.
 * Produces a solid dark gradient 1080x1920 vertical clip.
 */
export async function generateMockClip(outPath, durationSec = 5) {
  await run('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x12121f:size=1080x1920:rate=30`,
    '-t', String(durationSec),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    outPath,
  ]);
  return outPath;
}

