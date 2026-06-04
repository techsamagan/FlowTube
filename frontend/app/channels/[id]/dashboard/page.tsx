'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { nicheLabel } from '@/lib/api';
import { useChannel } from '../channel-context';

// Dashboard for one channel. Control-room layout per DESIGN.md:
// status-bar at the top, mono metrics, operations panels with amber accents.
export default function ChannelDashboard() {
  const { channel } = useChannel();
  const { id } = useParams<{ id: string }>();
  const pending = channel.isAiProposed && !channel.setupCompleted;

  // Tick a "last refreshed" timestamp so the page always shows movement.
  // Cheap: no network — just current time + per-second formatting.
  const now = useNow(1000);

  return (
    <>
      {/* ── Status bar: terminal-style strip of system state ────────── */}
      <div className="status-bar mb-6 rounded-lg">
        <span className="flex items-center gap-2">
          <span className="pulse-dot" aria-hidden /> LIVE
        </span>
        <span className="text-border">|</span>
        <span>
          CH <span className="font-mono text-ink/90">{channel.channelId.slice(0, 12)}…</span>
        </span>
        <span className="text-border">|</span>
        <span>
          UPDATED <span className="font-mono text-ink/90">{formatClock(now)}</span>
        </span>
        <span className="ml-auto text-muted/70">{nicheLabel(channel.niche)}</span>
      </div>

      <header className="mb-6">
        <p className="eyebrow mb-1">Channel</p>
        <h1 className="font-display text-3xl font-bold text-ink">{channel.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {channel.handle ?? 'no handle'} · {channel.language}
        </p>
      </header>

      {pending && (
        <div className="mb-6 rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          <span className="font-bold text-accent">PENDING SETUP.</span>{' '}
          <span className="text-ink/85">
            AI-proposed channel — not yet created on YouTube. Finish the one-time
            setup, then re-scan from{' '}
            <Link href="/dashboard" className="text-accent underline-offset-2 hover:underline">
              All channels
            </Link>
            .
          </span>
        </div>
      )}

      {/* ── Metric tiles ────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Subscribers" value={channel.subscriberCount} />
        <Metric label="Total views" value={channel.viewCount} />
        <Metric label="Videos shipped" value={channel.videoCount} />
        <Metric label="Account" value={channel.accountEmail} mono={false} />
      </div>

      {/* ── Operations: action panels, control-room styling ─────── */}
      <div className="mb-3 flex items-baseline justify-between">
        <p className="eyebrow">Operations</p>
        <p className="text-[11px] text-muted/70">amber = primary · ghost = secondary</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <OpsCard
          href={`/channels/${id}/generate`}
          title="Generate a Short"
          body="Spin up the viral-blueprint pipeline for this channel."
          cta="Start render"
          primary
        />
        <OpsCard
          href={`/channels/${id}/trends`}
          title="Trend radar"
          body="What to make next + when to post it."
          cta="Open radar"
        />
        <OpsCard
          href={`/channels/${id}/calendar`}
          title="Posting calendar"
          body="Queued + scheduled videos. Auto-publish at the slot."
          cta="View queue"
        />
        <OpsCard
          href={`/channels/${id}/settings`}
          title="Channel brief"
          body="Niche, language, brand voice, image + video providers."
          cta="Edit brief"
        />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function Metric({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="panel p-3">
      <p className="eyebrow">{label}</p>
      <p
        className={
          mono
            ? 'metric mt-2 text-2xl font-semibold text-ink'
            : 'mt-2 truncate text-sm font-medium text-ink/90'
        }
        title={String(value)}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function OpsCard({
  href,
  title,
  body,
  cta,
  primary = false,
}: {
  href: string;
  title: string;
  body: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="panel group block p-4 transition-colors duration-150 hover:border-accent/40"
    >
      <p className="font-display text-base font-bold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={
            primary
              ? 'inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-bg-2'
              : 'inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink/90 group-hover:border-accent/40'
          }
        >
          {cta}
        </span>
        <span className="text-[11px] text-muted/70 transition-colors group-hover:text-accent">
          ↗
        </span>
      </div>
    </Link>
  );
}

/* Re-render every `period` ms so the clock in the status bar ticks. */
function useNow(period: number) {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), period);
    return () => clearInterval(id);
  }, [period]);
  return t;
}

function formatClock(d: Date) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
