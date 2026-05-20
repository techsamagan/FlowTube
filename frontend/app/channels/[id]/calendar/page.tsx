'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  api,
  FORMAT_LABELS,
  type AutoMode,
  type CalendarEntry,
  type EntryStatus,
  type VideoFormat,
} from '@/lib/api';
import { useChannel } from '../channel-context';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Visible status chip — colour + label + a one-line hint when relevant.
function StatusChip({ e }: { e: CalendarEntry }) {
  const map: Record<
    EntryStatus,
    { label: string; cls: string; hint?: string }
  > = {
    planned: { label: 'Planned', cls: 'bg-surface-2 text-muted' },
    generating: {
      label: 'Generating…',
      cls: 'bg-accent/15 text-accent',
      hint: 'AI is rendering this video now.',
    },
    ready: {
      label: 'Queued',
      cls: 'bg-accent-2/15 text-accent-2',
      hint: 'Video ready — publishes at the scheduled time.',
    },
    publishing: {
      label: 'Publishing…',
      cls: 'bg-accent/15 text-accent',
    },
    published: { label: 'Published', cls: 'bg-viral/15 text-viral' },
    failed: { label: 'Failed', cls: 'bg-danger/15 text-danger' },
    generated: { label: 'Generated', cls: 'bg-accent/15 text-accent' },
  };
  const s = map[e.status] ?? map.planned;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
      title={s.hint ?? e.lastError ?? ''}
    >
      {s.label}
    </span>
  );
}

export default function ChannelCalendar() {
  const { channel } = useChannel();
  const [entries, setEntries] = useState<CalendarEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAuto, setAiAuto] = useState(false);

  // Manual-add form
  const [date, setDate] = useState('');
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<VideoFormat>('short');
  const [notes, setNotes] = useState('');
  const [autoMode, setAutoMode] = useState<AutoMode>('manual');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api
      .calendar(channel.id)
      .then((r) => setEntries(r.entries))
      .catch((e) => setErr((e as Error).message));
  }, [channel.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while anything is in-flight so the UI tracks the scheduler.
  useEffect(() => {
    if (!entries) return;
    const inFlight = entries.some((e) =>
      ['generating', 'publishing'].includes(e.status),
    );
    if (!inFlight) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [entries, load]);

  async function addManual() {
    if (!date || !topic) return;
    setAdding(true);
    setErr(null);
    try {
      await api.addCalendarEntry({
        channelId: channel.id,
        scheduledFor: new Date(date).toISOString(),
        topic,
        format,
        notes,
        autoMode,
      });
      setTopic('');
      setNotes('');
      setDate('');
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function generateAi() {
    setAiBusy(true);
    setErr(null);
    try {
      const r = await api.aiCalendar(channel.id, 14, 'short', aiAuto ? 'auto' : 'manual');
      setEntries(r.entries);
      if (r.created === 0)
        setErr('AI added no slots — try a wider window or scan trends first.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  async function toggleEntryAuto(e: CalendarEntry) {
    const next: AutoMode = e.autoMode === 'auto' ? 'manual' : 'auto';
    await api.updateCalendarEntry(e.id, { autoMode: next });
    load();
  }

  async function retry(id: string) {
    setErr(null);
    try {
      await api.retryCalendarEntry(id);
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(id: string) {
    await api.deleteCalendarEntry(id);
    load();
  }

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Calendar
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Plan posts for <span className="text-ink">{channel.name}</span>.
            Flip <span className="text-ink">Auto-publish</span> on a row and
            FlowTube will render and upload it at the scheduled time without
            you lifting a finger.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button onClick={generateAi} disabled={aiBusy} className="btn-primary">
            {aiBusy ? 'Generating…' : '✨ Generate with AI (14 days)'}
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={aiAuto}
              onChange={(e) => setAiAuto(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            Auto-publish AI plan (no review)
          </label>
        </div>
      </header>

      {err && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {err}
        </div>
      )}

      {/* ─── Add form ─── */}
      <div className="glass mb-6 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-[170px_1fr_140px_auto]">
        <label className="block">
          <span className="eyebrow mb-1 block">When</span>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field w-full"
          />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Topic</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What this post is about"
            className="field w-full"
          />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as VideoFormat)}
            className="field w-full"
          >
            <option value="short">Short</option>
            <option value="long">Long</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            onClick={addManual}
            disabled={!date || !topic || adding}
            className="btn-primary w-full"
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        <label className="block lg:col-span-4">
          <span className="eyebrow mb-1 block">Notes — optional</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Angle, hook idea, references…"
            className="field w-full"
          />
        </label>

        {/* Mode picker — segmented control, very obvious */}
        <div className="lg:col-span-4">
          <span className="eyebrow mb-1.5 block">Mode</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  k: 'manual',
                  t: 'Generate & review yourself',
                  d: 'I will click Generate, watch the result and approve the upload.',
                },
                {
                  k: 'auto',
                  t: 'Auto-publish at scheduled time',
                  d: 'AI generates and uploads to YouTube on its own — no review.',
                },
              ] as { k: AutoMode; t: string; d: string }[]
            ).map((o) => {
              const on = autoMode === o.k;
              return (
                <button
                  key={o.k}
                  type="button"
                  onClick={() => setAutoMode(o.k)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    on
                      ? 'border-accent bg-gradient-to-br from-accent/10 to-accent-2/10 text-ink'
                      : 'border-border bg-surface-2 text-muted hover:text-ink'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span
                      className={`grid h-4 w-4 place-items-center rounded-full border ${
                        on ? 'border-accent bg-accent' : 'border-border'
                      }`}
                    >
                      {on && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    {o.t}
                  </div>
                  <p className="mt-1 pl-6 text-xs leading-relaxed">{o.d}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Entries ─── */}
      {entries === null ? (
        <p className="text-sm text-muted">Loading calendar…</p>
      ) : entries.length === 0 ? (
        <div className="glass flex flex-col items-center px-8 py-16 text-center">
          <span className="tag">Empty</span>
          <p className="mt-4 max-w-md text-sm text-muted">
            No posts planned yet. Add one above, or generate a schedule with AI.
          </p>
        </div>
      ) : (
        <div className="glass divide-y divide-border">
          {entries.map((e) => (
            <EntryRow
              key={e.id}
              e={e}
              channelId={channel.id}
              onToggleAuto={() => toggleEntryAuto(e)}
              onRetry={() => retry(e.id)}
              onDelete={() => remove(e.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function EntryRow({
  e,
  channelId,
  onToggleAuto,
  onRetry,
  onDelete,
}: {
  e: CalendarEntry;
  channelId: string;
  onToggleAuto: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const editable = e.status === 'planned' || e.status === 'failed';
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="w-40 shrink-0">
        <p className="nums text-sm">{fmtDate(e.scheduledFor)}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{e.topic}</p>
        {(e.notes || e.lastError) && (
          <p
            className={`truncate text-xs ${
              e.lastError ? 'text-danger' : 'text-muted'
            }`}
            title={e.lastError ?? e.notes}
          >
            {e.lastError ? `Error: ${e.lastError}` : e.notes}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="tag">{FORMAT_LABELS[e.format]}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            e.source === 'ai' ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
          }`}
        >
          {e.source === 'ai' ? 'AI' : 'Manual'}
        </span>

        {/* Auto-mode toggle — only editable while still planned/failed */}
        <button
          onClick={onToggleAuto}
          disabled={!editable}
          title={
            e.autoMode === 'auto'
              ? 'Auto-publish on — click to require manual review'
              : 'Manual review on — click to auto-publish'
          }
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors ${
            e.autoMode === 'auto'
              ? 'border-viral/40 bg-viral/15 text-viral hover:bg-viral/20'
              : 'border-border bg-surface-2 text-muted hover:text-ink'
          } ${editable ? '' : 'opacity-60'}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              e.autoMode === 'auto' ? 'bg-viral' : 'bg-muted'
            }`}
          />
          {e.autoMode === 'auto' ? 'Auto-publish' : 'Review first'}
        </button>

        <StatusChip e={e} />

        {/* Primary action depends on state */}
        {e.status === 'planned' && e.autoMode === 'manual' && (
          <Link
            href={`/channels/${channelId}/generate?topic=${encodeURIComponent(
              e.topic,
            )}&format=${e.format}&entryId=${e.id}`}
            className="text-sm font-medium text-accent hover:underline"
          >
            Generate →
          </Link>
        )}
        {e.status === 'failed' && (
          <button
            onClick={onRetry}
            className="text-sm font-medium text-accent hover:underline"
          >
            Retry
          </button>
        )}

        <button
          onClick={onDelete}
          className="text-sm text-muted transition-colors hover:text-danger"
          aria-label="Delete entry"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
