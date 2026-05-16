import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

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

const NORM =
  'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1';

// Format-aware audio strategy (the "viral sound guide"):
//  short → punchy whoosh on every cut, music a touch louder.
//  long  → subtle riser on cuts, music quiet under the voice.
const AUDIO = {
  short: { musicVol: 0.16, sfxVol: 0.5, sfx: 'whoosh' },
  long: { musicVol: 0.09, sfxVol: 0.28, sfx: 'riser' },
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
 * @param {{voicePath:string, musicPath?:string, brollPaths:string[], sections:object[], format?:string, workDir:string, outPath:string}} a
 */
export async function assembleVideo({
  voicePath,
  musicPath = null,
  brollPaths,
  sections,
  format = 'short',
  workDir,
  outPath,
}) {
  const D = await probeDuration(voicePath);
  const n = brollPaths.length;
  const per = Math.max(D / n, 2);

  // 1. Normalize each B-roll clip to a uniform 1080x1920 segment of `per` sec
  //    (looping clips shorter than `per`).
  const segs = [];
  for (let i = 0; i < n; i++) {
    const seg = path.join(workDir, `seg${i}.mp4`);
    await run('ffmpeg', [
      '-y', '-stream_loop', '-1', '-i', brollPaths[i],
      '-t', per.toFixed(2), '-an',
      '-vf', NORM, '-r', '30',
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      seg,
    ]);
    segs.push(seg);
  }

  // 2. Concat segments.
  const listFile = path.join(workDir, 'concat.txt');
  await writeFile(listFile, segs.map((s) => `file '${s}'`).join('\n'));
  const broll = path.join(workDir, 'broll.mp4');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', broll]);

  // 3. Build the strategy-driven audio track (no dead-air start, ducked
  //    royalty-free music bed, SFX on every cut, -14 LUFS). SFX land on the
  //    visible B-roll cuts (multiples of `per`).
  const cutTimes = [];
  for (let t = per; t < D; t += per) cutTimes.push(t);
  const audio = await buildAudioMix({
    voicePath,
    musicPath,
    cutTimes,
    format,
    workDir,
  });
  const Dc = audio.durationSec; // post-silence-trim length drives everything

  // 4. Mux video + the finished audio, looped/trimmed to the audio length,
  //    burning captions when this FFmpeg build has the (libass) subtitles
  //    filter. Captions are timed to the trimmed audio so they stay in sync.
  //    Subtitles filter is path-sensitive → run in workDir with bare names.
  const captioned = await hasSubtitlesFilter();
  const args = [
    '-y', '-stream_loop', '-1', '-i', 'broll.mp4', '-i', audio.path,
    '-t', Dc.toFixed(2),
  ];
  if (captioned) {
    await buildSrt(sections, Dc, path.join(workDir, 'captions.srt'));
    args.push(
      '-vf',
      "subtitles=captions.srt:force_style='Fontname=Sans,Fontsize=15,Bold=1," +
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1," +
        "Outline=3,Shadow=0,Alignment=2,MarginV=240'",
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "⚠️  FFmpeg has no 'subtitles' filter (libass missing) — rendering " +
        'without burned captions. `brew install ffmpeg` to enable them.',
    );
  }
  args.push(
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', outPath,
  );
  await run('ffmpeg', args, workDir);

  return {
    path: outPath,
    durationSec: Math.round(Dc),
    captioned,
    hasMusic: Boolean(musicPath),
  };
}
