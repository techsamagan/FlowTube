'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  api,
  nicheLabel,
  FORMAT_LABELS,
  type VideoResult,
  type VideoFormat,
} from '@/lib/api';
import { useChannel } from '../channel-context';

// Pipeline steps now reflect the AI Image-to-Video architecture.
// Step timing is an estimate — the backend call is synchronous and can take
// several minutes for long-form content (Claude → ElevenLabs → Imagen → FFmpeg).
const STEPS = [
  'Script generation (Claude)',
  'Voiceover synthesis (ElevenLabs)',
  'AI image generation',
  'AI video animation',
  'Video assembly (FFmpeg)',
  'AI quality review',
];

const PROVIDER_LABELS: Record<string, string> = {
  GEMINI: 'Gemini Imagen',
  FLUX: 'Flux Schnell',
  DALLE3: 'DALL·E 3',
  HIGGSFIELD: 'Higgsfield',
  KLING: 'Kling AI',
  LUMA: 'Luma Dream',
  NONE: 'Stock B-roll',
};

function ProviderBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted">
      <span className="text-accent/70">{label}</span>
      <span className="text-ink">{PROVIDER_LABELS[value] ?? value}</span>
    </span>
  );
}

export default function ChannelGeneratePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <ChannelGenerate />
    </Suspense>
  );
}

function ChannelGenerate() {
  const { channel } = useChannel();
  const params = useSearchParams();
  const [topic, setTopic] = useState(params.get('topic') ?? '');
  const [format, setFormat] = useState<VideoFormat>(
    params.get('format') === 'long' ? 'long' : 'short',
  );
  const entryId = params.get('entryId');
  const [step, setStep] = useState(-1);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<
    { status: 'idle' | 'uploading' | 'scheduling' | 'done' | 'scheduled' | 'error'; note?: string; url?: string }
  >({ status: 'idle' });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const imageProvider = channel.imageProvider ?? 'GEMINI';
  const videoProvider = channel.videoProvider ?? 'KLING';

  async function run() {
    setErr(null);
    setResult(null);
    setUploadState({ status: 'idle' });
    setStep(0);

    // Advance the visual stepper on a timed estimate.
    // Image generation + animation can each take 20-90 s per clip.
    const tick = format === 'long' ? 22000 : 8000;
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, tick);

    try {
      const r = await api.generateVideo(channel.id, topic, format, false, entryId);
      if (timer.current) clearInterval(timer.current);
      setResult(r);
      setStep(STEPS.length);
    } catch (e) {
      if (timer.current) clearInterval(timer.current);
      setErr((e as Error).message);
      setStep(-1);
    }
  }

  async function approveAndUpload() {
    if (!result) return;
    setUploadState({ status: 'uploading' });
    try {
      const r = await api.approveUpload(result.videoId);
      setUploadState({ status: 'done', note: r.uploadNote, url: r.youtube.url });
    } catch (e) {
      setUploadState({ status: 'error', note: (e as Error).message });
    }
  }

  async function approveAndSchedule() {
    if (!result || !entryId) return;
    setUploadState({ status: 'scheduling' });
    try {
      await api.scheduleVideo(result.videoId, entryId);
      setUploadState({
        status: 'scheduled',
        note: 'Queued. FlowTube will publish this at the scheduled calendar time.',
      });
    } catch (e) {
      setUploadState({ status: 'error', note: (e as Error).message });
    }
  }

  const running = step >= 0 && step < STEPS.length;
  const script = result?.script ?? null;
  const meta = result?.metadata ?? null;
  const review = result?.review ?? null;

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Generate a video</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">
            {channel.name} · {nicheLabel(channel.niche)} · {channel.language}
          </span>
          <span className="text-muted">·</span>
          <ProviderBadge label="Image" value={imageProvider} />
          <ProviderBadge label="Video" value={videoProvider} />
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* ── Left panel: controls + stepper ── */}
        <div className="glass h-fit space-y-4 p-5">
          <div>
            <span className="eyebrow mb-1.5 block">Format</span>
            <div className="grid grid-cols-2 gap-2">
              {(['short', 'long'] as VideoFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  disabled={running}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    format === f
                      ? 'border-accent bg-surface-2 text-ink'
                      : 'border-border text-muted hover:text-ink'
                  }`}
                >
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {format === 'long'
                ? 'Long-form (4–10 min). Rendering takes several minutes.'
                : 'Vertical Short (10–30s), seamless loop.'}
            </p>
          </div>

          <label className="block">
            <span className="eyebrow mb-1 block">Topic — optional</span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="AI picks a high-performing topic if blank"
              className="field w-full"
            />
          </label>

          <button onClick={run} disabled={running} className="btn-primary w-full">
            {running ? 'Generating…' : 'Generate'}
          </button>

          {running && (
            <p className="text-xs text-muted">
              {imageProvider === 'GEMINI' ? 'Gemini Imagen' : imageProvider} is rendering
              each scene, then {videoProvider === 'NONE' ? 'stock clips' : (PROVIDER_LABELS[videoProvider] ?? videoProvider)} animates
              them into video. Keep this tab open.
            </p>
          )}
          {err && <p className="text-sm text-danger">{err}</p>}

          <div className="hairline !my-1" />
          <div className="space-y-3 pt-1">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-3 text-sm">
                <span
                  className={`nums grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] transition-colors ${
                    step > i
                      ? 'bg-viral text-bg'
                      : step === i
                        ? 'bg-accent text-white'
                        : 'border border-border text-muted'
                  }`}
                >
                  {step > i ? '✓' : i + 1}
                </span>
                <span className={step >= i ? 'text-ink' : 'text-muted'}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right panel: result ── */}
        <div className="min-h-[420px]">
          <AnimatePresence mode="wait">
            {result && script ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* AI quality gate */}
                {review && (
                  <div
                    className={`glass border p-5 ${
                      review.verdict === 'pass'
                        ? 'border-viral/40'
                        : 'border-danger/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="eyebrow">AI quality review</p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          review.verdict === 'pass'
                            ? 'bg-viral/15 text-viral'
                            : 'bg-danger/15 text-danger'
                        }`}
                      >
                        {review.verdict === 'pass' ? 'PASS' : 'NEEDS WORK'} ·{' '}
                        {review.score}/10
                      </span>
                    </div>
                    <p className="mt-2 text-sm">{review.summary}</p>
                    <ul className="mt-2 space-y-1 text-sm text-muted">
                      {review.reasons.map((r, i) => (
                        <li key={i}>• {r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="glass space-y-3 p-5">
                  <div className="flex items-center gap-4">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md border border-border">
                      <span className="nums text-2xl font-semibold text-viral">
                        {script.viralScore}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium leading-tight">{script.title}</p>
                      <p className="eyebrow mt-1">
                        {FORMAT_LABELS[result.format]} · {result.durationSec}s rendered
                        {result.captioned ? '' : ' · no burned captions'}
                        {result.music ? ' · 🎵 music bed' : ' · no music'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <ProviderBadge label="Image" value={imageProvider} />
                        <ProviderBadge label="Video" value={videoProvider} />
                      </div>
                    </div>
                  </div>

                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={result.videoUrl}
                    controls
                    playsInline
                    className="mx-auto aspect-[9/16] w-full max-w-[270px] rounded-lg border border-border bg-black"
                  />

                  {/* Approve / publish gate */}
                  {uploadState.status === 'done' ? (
                    <div className="space-y-2">
                      <p className="text-sm text-viral">{uploadState.note}</p>
                      <a
                        href={uploadState.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary inline-block w-full text-center"
                      >
                        Open on YouTube ↗
                      </a>
                    </div>
                  ) : uploadState.status === 'scheduled' ? (
                    <div className="rounded-lg border border-viral/30 bg-viral/10 p-3 text-sm text-viral">
                      ✓ {uploadState.note}
                    </div>
                  ) : result.canUpload ? (
                    <div className="space-y-2">
                      <button
                        onClick={approveAndUpload}
                        disabled={
                          uploadState.status === 'uploading' ||
                          uploadState.status === 'scheduling'
                        }
                        className="btn-primary w-full"
                      >
                        {uploadState.status === 'uploading'
                          ? 'Uploading…'
                          : review?.verdict === 'pass'
                            ? 'Approve & upload to YouTube'
                            : 'Upload anyway (override review)'}
                      </button>

                      {entryId && (
                        <button
                          onClick={approveAndSchedule}
                          disabled={
                            uploadState.status === 'uploading' ||
                            uploadState.status === 'scheduling'
                          }
                          className="btn-ghost w-full"
                        >
                          {uploadState.status === 'scheduling'
                            ? 'Scheduling…'
                            : 'Approve & publish at calendar time'}
                        </button>
                      )}

                      {uploadState.status === 'error' && (
                        <p className="text-sm text-danger">{uploadState.note}</p>
                      )}
                      <p className="text-center text-xs text-muted">
                        {entryId
                          ? 'Approve to publish now, or schedule for the calendar time.'
                          : 'Nothing is published until you approve. Uploads are private by default.'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">{result.uploadNote}</p>
                  )}
                </div>

                {/* Script sections */}
                <div className="glass space-y-4 p-5">
                  {script.sections.map((s) => (
                    <div key={s.label} className="border-l border-border pl-4">
                      <p className="eyebrow">
                        {s.timecode} · {s.label}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed">{s.text}</p>
                    </div>
                  ))}
                </div>

                {/* SEO metadata */}
                {meta && (
                  <div className="glass p-5 text-sm">
                    <p className="eyebrow mb-2">SEO metadata</p>
                    <p className="font-medium">{meta.title}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {meta.tags.map((t) => (
                        <span key={t} className="tag">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass grid min-h-[420px] place-items-center p-10 text-center"
              >
                <div className="max-w-xs space-y-3">
                  <p className="text-sm text-muted">
                    {running
                      ? 'AI pipeline running — the player and quality review appear here when rendering finishes.'
                      : 'Pick a format and topic, then generate. FlowTube uses AI to create images and animate them into video clips before assembling the final Short.'}
                  </p>
                  {!running && (
                    <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                      <ProviderBadge label="Image" value={imageProvider} />
                      <ProviderBadge label="Video" value={videoProvider} />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
