'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { api, type Recommendations } from '@/lib/api';
import { useChannel } from '../channel-context';

export default function ChannelTrends() {
  const { channel } = useChannel();
  const { id } = useParams<{ id: string }>();
  const [rec, setRec] = useState<Recommendations | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function analyze() {
    setBusy(true);
    setErr(null);
    setRec(null);
    try {
      await api.scanTrends(channel.id);
      setRec(await api.recommendations(channel.id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Trends</h1>
          <p className="mt-1 text-sm text-muted">
            What to make next and when to post — for {channel.name}.
          </p>
        </div>
        <button onClick={analyze} disabled={busy} className="btn-primary">
          {busy ? 'Analyzing…' : 'Analyze & recommend'}
        </button>
      </header>

      {err && <p className="mb-6 text-sm text-danger">{err}</p>}

      {!rec && !busy && (
        <div className="glass px-8 py-16 text-center text-sm text-muted">
          Run an analysis to scan trending Shorts in this niche.
        </div>
      )}

      {rec && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
          <p className="eyebrow nums">
            Analyzed <b className="text-ink">{rec.basis.trendVideosAnalyzed}</b> Shorts ·{' '}
            <b className="text-viral">{rec.basis.viralVideosFound}</b> viral ·{' '}
            {rec.basis.source} · confidence {Math.round(rec.basis.confidence * 100)}%
          </p>

          <section>
            <h2 className="mb-4 text-lg font-semibold">
              What to make next{' '}
              <span className="text-sm text-muted">— ranked by predicted virality</span>
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              {rec.whatToMake.map((w) => (
                <div key={w.rank} className="glass glass-hover p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow text-accent">
                        #{w.rank} · {w.hookArchetype} hook
                      </p>
                      <p className="mt-1 text-base font-semibold capitalize">
                        {w.topic}
                      </p>
                    </div>
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-border">
                      <span className="nums text-lg font-semibold text-viral">
                        {w.predictedViralScore}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 rounded-md border border-border bg-bg-2 px-3 py-2 text-sm text-muted">
                    “{w.exampleHook}”
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-muted">{w.rationale}</p>
                  <div className="my-5 hairline" />
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span className="nums">
                      Target {w.durationTarget.min}–{w.durationTarget.max}s · conf{' '}
                      {Math.round(w.confidence * 100)}%
                    </span>
                    <Link
                      href={`/channels/${id}/generate`}
                      className="text-accent transition-colors hover:text-ink"
                    >
                      Generate this →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-lg font-semibold">
              When to post{' '}
              <span className="text-sm text-muted">— highest-retention windows</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {rec.whenToPost.map((w) => (
                <div key={w.label} className="glass glass-hover p-5">
                  <p className="nums text-base font-semibold">{w.label}</p>
                  <p className="nums mt-1 text-xs text-viral">
                    {w.avgRetention}% retention
                  </p>
                  <p className="mt-2 text-[11px] leading-snug text-muted">{w.rationale}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="glass p-7">
              <h3 className="mb-4 text-base font-semibold">Trending now</h3>
              <p className="eyebrow">Hot hooks</p>
              {rec.trendingNow.hotHooks.map((h) => (
                <div
                  key={h.archetype}
                  className="mt-2 flex justify-between border-b border-border/60 pb-2 text-sm last:border-0"
                >
                  <span>{h.archetype}</span>
                  <span className="nums text-viral">
                    {h.avgRetention}% · {h.occurrences}×
                  </span>
                </div>
              ))}
              <p className="eyebrow mt-6">Rising topics</p>
              {rec.trendingNow.risingTopics.map((t) => (
                <div
                  key={t.topic}
                  className="mt-2 flex justify-between border-b border-border/60 pb-2 text-sm last:border-0"
                >
                  <span className="capitalize">{t.topic}</span>
                  <span className="nums text-muted">
                    {t.avgViews.toLocaleString()} views
                  </span>
                </div>
              ))}
            </div>
            <div className="glass p-7">
              <h3 className="mb-4 text-base font-semibold">
                Channel viral DNA{' '}
                <span className="text-xs text-muted">· {rec.viralDNA.source}</span>
              </h3>
              <Dna label="Best hooks" value={rec.viralDNA.bestHookStyles.join(', ')} />
              <Dna label="Top topics" value={rec.viralDNA.topPerformingTopics.join(', ')} />
              <Dna
                label="Optimal duration"
                value={`${rec.viralDNA.optimalDuration.min}–${rec.viralDNA.optimalDuration.max}s`}
              />
              <Dna label="Best times" value={rec.viralDNA.bestPostingTimes.join(' · ')} />
              <Dna
                label="Avg viral retention"
                value={`${rec.viralDNA.avgRetentionViral}%`}
              />
              <Dna
                label="Confidence"
                value={`${Math.round(rec.viralDNA.confidenceScore * 100)}% · ${rec.viralDNA.totalVideosAnalyzed} analyzed`}
              />
            </div>
          </section>
        </motion.div>
      )}
    </>
  );
}

function Dna({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 flex justify-between gap-6 border-b border-border/60 pb-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right capitalize">{value || '—'}</span>
    </div>
  );
}
