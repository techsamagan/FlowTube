'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  api,
  FORMAT_LABELS,
  type CalendarEntry,
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

export default function ChannelCalendar() {
  const { channel } = useChannel();
  const [entries, setEntries] = useState<CalendarEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  // Manual-add form
  const [date, setDate] = useState('');
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<VideoFormat>('short');
  const [notes, setNotes] = useState('');
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
      const r = await api.aiCalendar(channel.id, 14, 'short');
      setEntries(r.entries);
      if (r.created === 0)
        setErr('AI added no slots — try a wider window or scan trends first.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAiBusy(false);
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
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="mt-1 text-sm text-muted">
            Plan posts for {channel.name}. Add them by hand or let AI fill the
            best windows from this channel&apos;s viral DNA.
          </p>
        </div>
        <button onClick={generateAi} disabled={aiBusy} className="btn-primary">
          {aiBusy ? 'Generating…' : '✨ Generate with AI (14 days)'}
        </button>
      </header>

      {err && <p className="mb-4 text-sm text-danger">{err}</p>}

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
      </div>

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
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
            >
              <div className="w-40 shrink-0">
                <p className="nums text-sm">{fmtDate(e.scheduledFor)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.topic}</p>
                {e.notes && (
                  <p className="truncate text-xs text-muted" title={e.notes}>
                    {e.notes}
                  </p>
                )}
              </div>
              <span className="tag">{FORMAT_LABELS[e.format]}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  e.source === 'ai'
                    ? 'bg-accent/15 text-accent'
                    : 'bg-surface-2 text-muted'
                }`}
              >
                {e.source === 'ai' ? 'AI' : 'Manual'}
              </span>
              <span
                className={`text-xs ${
                  e.status === 'published'
                    ? 'text-viral'
                    : e.status === 'generated'
                      ? 'text-accent'
                      : 'text-muted'
                }`}
              >
                {e.status}
              </span>
              {e.status === 'planned' && (
                <Link
                  href={`/channels/${channel.id}/generate?topic=${encodeURIComponent(
                    e.topic,
                  )}&format=${e.format}`}
                  className="text-sm text-accent hover:underline"
                >
                  Generate →
                </Link>
              )}
              <button
                onClick={() => remove(e.id)}
                className="text-sm text-muted transition-colors hover:text-danger"
                aria-label="Delete entry"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
