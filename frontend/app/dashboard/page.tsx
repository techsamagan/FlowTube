'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  api,
  clearToken,
  getToken,
  googleConnectUrl,
  nicheLabel,
  LANGUAGES,
  NICHES,
  type Channel,
  type Identity,
} from '@/lib/api';

const ERR_MSG: Record<string, string> = {
  session_expired: 'Session expired — sign in again before connecting.',
  account_linked_elsewhere: 'That Google account is already linked to another FlowTube user.',
  oauth_failed: 'Google sign-in failed. Please try again.',
  access_denied: 'You declined the Google permission request.',
};

export default function AllChannelsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [empty, setEmpty] = useState<{ googleAccountId: string; email: string }[]>([]);
  const [accountCount, setAccountCount] = useState(0);
  const [googleReady, setGoogleReady] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Filters
  const [fNiche, setFNiche] = useState('all');
  const [fLang, setFLang] = useState('all');

  async function load() {
    const [{ channels }, { accounts }] = await Promise.all([api.channels(), api.accounts()]);
    setChannels(channels);
    setAccountCount(accounts.length);
    setLoading(false);
  }

  async function detect() {
    setBusy('detect');
    try {
      const r = await api.detect();
      setEmpty(r.emptyAccounts);
      await load();
    } finally {
      setBusy(null);
    }
  }

  function connectGoogle() {
    const t = getToken();
    if (t) window.location.href = googleConnectUrl(t);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api.googleConfig().then((r) => setGoogleReady(r.configured)).catch(() => {});
    const q = new URLSearchParams(window.location.search);
    const err = q.get('connect_error');
    const ok = q.get('connected');
    if (err || ok) window.history.replaceState({}, '', '/dashboard');
    if (err) {
      setNotice({ kind: 'err', text: ERR_MSG[err] ?? `Connect failed: ${err}` });
      load();
    } else if (ok) {
      setNotice({ kind: 'ok', text: 'Google account connected. Pulling in channels…' });
      detect();
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const langOptions = useMemo(() => {
    const set = new Set<string>(channels.map((c) => c.language).filter(Boolean));
    return Array.from(new Set([...LANGUAGES, ...set]));
  }, [channels]);

  const visible = channels.filter(
    (c) =>
      (fNiche === 'all' || c.niche === fNiche) &&
      (fLang === 'all' || c.language === fLang),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Top bar */}
      <div className="mb-10 flex items-center justify-between">
        <span className="text-lg font-semibold">FlowTube</span>
        <button
          onClick={() => {
            clearToken();
            router.replace('/login');
          }}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Sign out
        </button>
      </div>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your channels</h1>
          <p className="mt-1 text-sm text-muted">
            Pick a channel to open its workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={connectGoogle} className="btn-primary" title="Real Google OAuth">
            + Connect Google account
          </button>
          {accountCount > 0 && (
            <button onClick={detect} disabled={!!busy} className="btn-ghost">
              {busy === 'detect' ? 'Scanning…' : 'Re-scan'}
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div
          className={`mb-6 rounded-md border px-4 py-3 text-sm ${
            notice.kind === 'ok' ? 'border-viral/30 text-viral' : 'border-danger/40 text-danger'
          }`}
        >
          {notice.text}
        </div>
      )}

      {!googleReady && (
        <div className="mb-6 rounded-md border border-danger/40 px-4 py-3 text-sm text-muted">
          Google OAuth isn&apos;t configured yet, so no channels can be connected.
          Add <span className="text-ink">GOOGLE_CLIENT_ID</span> /{' '}
          <span className="text-ink">GOOGLE_CLIENT_SECRET</span> — see{' '}
          <span className="text-ink">README → &ldquo;Connect real YouTube data&rdquo;</span>,
          then restart the backend.
        </div>
      )}

      {empty.length > 0 && <AiSetup empty={empty} onDone={load} />}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="eyebrow mb-1 block">Niche</span>
          <select value={fNiche} onChange={(e) => setFNiche(e.target.value)} className="field">
            <option value="all">All niches</option>
            {NICHES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="eyebrow mb-1 block">Language</span>
          <select value={fLang} onChange={(e) => setFLang(e.target.value)} className="field">
            <option value="all">All languages</option>
            {langOptions.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {(fNiche !== 'all' || fLang !== 'all') && (
          <button
            onClick={() => {
              setFNiche('all');
              setFLang('all');
            }}
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            Clear
          </button>
        )}
        <span className="ml-auto self-center text-sm text-muted">
          {visible.length} of {channels.length}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : channels.length === 0 ? (
        <div className="glass px-8 py-16 text-center text-sm text-muted">
          No channels yet. Connect a Google account to pull in its channels.
        </div>
      ) : visible.length === 0 ? (
        <div className="glass px-8 py-16 text-center text-sm text-muted">
          No channels match these filters.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <ChannelCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </main>
  );
}

function ChannelCard({ c }: { c: Channel }) {
  const avatar = c.aiIdentity?.avatarUrl ?? `https://api.dicebear.com/9.x/glass/svg?seed=${c.name}`;
  return (
    <Link href={`/channels/${c.id}/dashboard`} className="glass glass-hover block p-5">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt="" className="h-11 w-11 rounded-full border border-border" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{c.name}</p>
          <p className="truncate text-xs text-muted">{c.handle ?? 'no handle'}</p>
        </div>
        {c.isAiProposed && !c.setupCompleted && <span className="tag">Pending</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="tag">{nicheLabel(c.niche)}</span>
        <span className="tag">{c.language}</span>
      </div>

      <div className="my-4 hairline" />

      <div className="grid grid-cols-3 gap-3">
        <Mini label="Subs" value={c.subscriberCount.toLocaleString()} />
        <Mini label="Views" value={c.viewCount.toLocaleString()} />
        <Mini label="Videos" value={c.videoCount} />
      </div>
    </Link>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="nums text-base font-semibold">{value}</p>
      <p className="eyebrow mt-0.5">{label}</p>
    </div>
  );
}

function AiSetup({
  empty,
  onDone,
}: {
  empty: { googleAccountId: string; email: string }[];
  onDone: () => void;
}) {
  const acct = empty[0];
  const [niche, setNiche] = useState('finance');
  const [language, setLanguage] = useState('English');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="glass mb-6 p-6">
      <h2 className="text-base font-semibold">{acct.email} has no YouTube channel</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        YouTube has no API to create a channel or set its avatar. FlowTube
        drafts the full identity below — you do the one-time create on YouTube,
        then we sync everything else automatically.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="eyebrow mb-1 block">Niche</span>
          <select value={niche} onChange={(e) => setNiche(e.target.value)} className="field">
            {NICHES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="eyebrow mb-1 block">Language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="field"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.aiIdentity(niche);
              setIdentity(r.identity);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Drafting…' : 'Generate identity'}
        </button>
      </div>

      {identity && (
        <div className="mt-6 flex flex-col gap-5 rounded-lg border border-border bg-bg-2 p-5 md:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={identity.avatarUrl}
            alt="AI avatar"
            className="h-20 w-20 rounded-full border border-border"
          />
          <div className="flex-1">
            <p className="text-lg font-semibold">{identity.name}</p>
            <p className="text-sm text-accent">{identity.handle}</p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              {identity.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={identity.createChannelUrl}
                target="_blank"
                className="btn-primary"
                rel="noreferrer"
              >
                Create on YouTube ↗
              </a>
              <button
                className="btn-ghost"
                onClick={async () => {
                  await api.createPending(acct.googleAccountId, niche, language, identity);
                  onDone();
                }}
              >
                Save as pending
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">{identity.note}</p>
          </div>
        </div>
      )}
    </div>
  );
}
