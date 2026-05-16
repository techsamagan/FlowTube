'use client';

import { useState } from 'react';
import { api, NICHES, LANGUAGES } from '@/lib/api';
import { useChannel } from '../channel-context';

export default function ChannelSettings() {
  const { channel, reload } = useChannel();
  const [niche, setNiche] = useState(channel.niche);
  const [language, setLanguage] = useState(channel.language);
  const [description, setDescription] = useState(channel.description ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    niche !== channel.niche ||
    language !== channel.language ||
    description !== (channel.description ?? '');

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await api.updateChannel(channel.id, { niche, language, description });
      reload();
      setMsg({ ok: true, text: 'Saved. This now steers script generation and trend picks.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const readOnly: [string, string][] = [
    ['Channel name', channel.name],
    ['Handle', channel.handle ?? '—'],
    ['YouTube channel ID', channel.channelId],
    ['Connected account', channel.accountEmail],
    [
      'Setup status',
      channel.isAiProposed
        ? channel.setupCompleted
          ? 'AI-proposed · created'
          : 'AI-proposed · pending creation'
        : 'Live channel',
    ],
  ];

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">Settings</h1>
      <p className="mb-8 text-sm text-muted">
        Niche, language and the channel brief drive every generated script and
        the topics the AI recommends.
      </p>

      <div className="glass space-y-5 p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow mb-1 block">Niche</span>
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="field w-full"
            >
              {NICHES.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="eyebrow mb-1 block">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="field w-full"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="eyebrow mb-1 block">
            Channel brief — purpose &amp; how videos must be
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
            rows={7}
            placeholder="What this channel is about, who it's for, the angle and tone, what every video must do (e.g. 'Dark, cinematic horror lore explainers — slow ominous narration, always end on an unanswered question'). The script generator follows this exactly."
            className="field w-full resize-y leading-relaxed"
          />
          <span className="mt-1 block text-xs text-muted">
            {description.length}/2000 · this is sent verbatim to the script
            generator as the brand contract.
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="btn-primary"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {msg && (
            <span className={`text-sm ${msg.ok ? 'text-viral' : 'text-danger'}`}>
              {msg.text}
            </span>
          )}
        </div>
      </div>

      <div className="glass mt-5 divide-y divide-border">
        {readOnly.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-6 px-5 py-4">
            <span className="text-sm text-muted">{k}</span>
            <span className="truncate text-right text-sm" title={v}>
              {v}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
