'use client';

import { useState } from 'react';
import { api, NICHES, LANGUAGES } from '@/lib/api';
import { useChannel } from '../channel-context';

// Must stay in sync with IMAGE_PROVIDERS / VIDEO_PROVIDERS in
// backend/src/routes/channels.js and the switch statements in
// services/imageProviders.js + services/videoProviders.js.
const IMAGE_PROVIDERS: { value: string; label: string; hint: string }[] = [
  { value: 'GEMINI', label: 'Gemini Imagen (Google) — default', hint: 'Uses GEMINI_API_KEY + Google Cloud project. Free tier available.' },
  { value: 'DALLE3', label: 'DALL·E 3 / ChatGPT (OpenAI)', hint: 'Requires OPENAI_API_KEY. Higher cost, very strong quality.' },
  { value: 'FLUX', label: 'Flux Schnell (fal.ai)', hint: 'Requires FAL_KEY. Fastest, cheapest.' },
];

const VIDEO_PROVIDERS: { value: string; label: string; hint: string }[] = [
  { value: 'VEO', label: 'Veo (Google) — default', hint: 'Image-to-video on Vertex AI. Uses GEMINI_API_KEY + Google Cloud project. Requires Vertex AI Platform to be enabled.' },
  { value: 'KLING', label: 'Kling AI', hint: 'Requires KLING_API_KEY. Best motion quality per dollar.' },
  { value: 'LUMA', label: 'Luma Dream Machine', hint: 'Requires LUMA_API_KEY.' },
  { value: 'NONE', label: 'No AI video (Pexels stock b-roll)', hint: 'Skips image-to-video, uses real Pexels footage matched per scene. Cheapest and most reliable.' },
];

export default function ChannelSettings() {
  const { channel, reload } = useChannel();
  const [niche, setNiche] = useState(channel.niche);
  const [language, setLanguage] = useState(channel.language);
  const [description, setDescription] = useState(channel.description ?? '');
  const [imageProvider, setImageProvider] = useState(channel.imageProvider ?? 'GEMINI');
  const [videoProvider, setVideoProvider] = useState(channel.videoProvider ?? 'VEO');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    niche !== channel.niche ||
    language !== channel.language ||
    description !== (channel.description ?? '') ||
    imageProvider !== (channel.imageProvider ?? 'GEMINI') ||
    videoProvider !== (channel.videoProvider ?? 'VEO');

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await api.updateChannel(channel.id, {
        niche,
        language,
        description,
        imageProvider,
        videoProvider,
      });
      reload();
      setMsg({ ok: true, text: 'Saved. New renders will use these providers.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const imageHint = IMAGE_PROVIDERS.find((p) => p.value === imageProvider)?.hint ?? '';
  const videoHint = VIDEO_PROVIDERS.find((p) => p.value === videoProvider)?.hint ?? '';

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

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow mb-1 block">Image generator</span>
            <select
              value={imageProvider}
              onChange={(e) => setImageProvider(e.target.value)}
              className="field w-full"
            >
              {IMAGE_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">{imageHint}</span>
          </label>

          <label className="block">
            <span className="eyebrow mb-1 block">Video generator</span>
            <select
              value={videoProvider}
              onChange={(e) => setVideoProvider(e.target.value)}
              className="field w-full"
            >
              {VIDEO_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">{videoHint}</span>
          </label>
        </div>

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
