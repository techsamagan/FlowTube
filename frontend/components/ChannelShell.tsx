'use client';

import Link from 'next/link';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { clearToken } from '@/lib/api';
import { nicheLabel } from '@/lib/api';
import type { Channel } from '@/lib/api';

const SECTIONS = [
  ['dashboard', 'Dashboard'],
  ['generate', 'Generate'],
  ['trends', 'Trends'],
  ['analytics', 'Analytics'],
  ['calendar', 'Calendar'],
  ['settings', 'Settings'],
];

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

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border px-5 py-6 md:flex">
        <Link
          href="/dashboard"
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          ← All channels
        </Link>

        <div className="mt-5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatar}
            alt=""
            className="h-10 w-10 rounded-full border border-border"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{channel.name}</p>
            <p className="truncate text-xs text-muted">
              {nicheLabel(channel.niche)} · {channel.language}
            </p>
          </div>
        </div>

        <nav className="mt-8 flex flex-col gap-1">
          {SECTIONS.map(([seg, label]) => {
            const href = `${base}/${seg}`;
            const active = path === href;
            return (
              <Link
                key={seg}
                href={href}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-surface-2 text-ink'
                    : 'text-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => {
            clearToken();
            router.replace('/');
          }}
          className="mt-auto px-3 py-2 text-left text-sm text-muted transition-colors hover:text-ink"
        >
          Sign out
        </button>
      </aside>

      <main className="flex-1 px-6 py-10 md:px-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
