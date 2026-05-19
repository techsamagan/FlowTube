'use client';

import Link from 'next/link';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { clearToken, nicheLabel } from '@/lib/api';
import type { Channel } from '@/lib/api';
import ThemeToggle from '@/components/ThemeToggle';

// [segment, label, icon path]. One nav model drives the desktop sidebar and
// the mobile bottom tab bar so behaviour stays identical on every screen.
const SECTIONS: [string, string, string][] = [
  ['dashboard', 'Dashboard', 'M4 13h7V4H4zM13 21h7V8h-7zM4 21h7v-5H4zM13 4v1'],
  ['generate', 'Generate', 'M13 2L4 14h7l-1 8 9-12h-7z'],
  ['trends', 'Trends', 'M3 17l6-6 4 4 8-8M21 7v6M21 7h-6'],
  ['analytics', 'Analytics', 'M4 20V10M10 20V4M16 20v-7M22 20H2'],
  ['calendar', 'Calendar', 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4'],
  ['settings', 'Settings', 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.3 2.5h4l.3-2.5a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z'],
];

function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

export default function ChannelShell({
  channel,
  children,
}: {
  channel: Channel & { accountEmail: string };
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/channels/${id}`;
  const avatar =
    channel.aiIdentity?.avatarUrl ??
    `https://api.dicebear.com/9.x/glass/svg?seed=${channel.name}`;

  const active = (seg: string) => path === `${base}/${seg}`;
  const current =
    SECTIONS.find(([seg]) => active(seg))?.[1] ?? 'Dashboard';

  function signOut() {
    clearToken();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen">
      {/* ───────── desktop sidebar ───────── */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface/40 px-4 py-5 md:flex">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          All channels
        </Link>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatar}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full border border-border"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{channel.name}</p>
            <p className="truncate text-xs text-muted">
              {nicheLabel(channel.niche)} · {channel.language}
            </p>
          </div>
        </div>

        <nav className="mt-6 flex flex-col gap-1">
          {SECTIONS.map(([seg, label, icon]) => {
            const on = active(seg);
            return (
              <Link
                key={seg}
                href={`${base}/${seg}`}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  on
                    ? 'bg-gradient-to-r from-accent/15 to-accent-2/15 text-ink ring-1 ring-inset ring-accent/30'
                    : 'text-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <span className={on ? 'text-accent' : ''}>
                  <Icon d={icon} />
                </span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
          <button
            onClick={signOut}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign out
          </button>
          <ThemeToggle />
        </div>
      </aside>

      {/* ───────── content column ───────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile top bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 py-3 backdrop-blur-xl md:hidden">
          <Link
            href="/dashboard"
            aria-label="All channels"
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
          </Link>
          <div className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full border border-border"
            />
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-semibold leading-tight">
                {channel.name}
              </p>
              <p className="truncate text-[11px] text-muted">{current}</p>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 px-5 py-7 pb-28 sm:px-8 md:px-10 md:py-10 md:pb-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>

      {/* ───────── mobile bottom tab bar ───────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {SECTIONS.map(([seg, label, icon]) => {
            const on = active(seg);
            return (
              <Link
                key={seg}
                href={`${base}/${seg}`}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition-colors ${
                  on ? 'text-accent' : 'text-muted'
                }`}
              >
                <Icon d={icon} className="h-[22px] w-[22px]" />
                <span className="leading-none">{label}</span>
              </Link>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
