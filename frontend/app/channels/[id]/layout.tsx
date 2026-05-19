'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ChannelShell from '@/components/ChannelShell';
import { api, getToken, type Channel } from '@/lib/api';
import { ChannelContext } from './channel-context';

export default function ChannelLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [channel, setChannel] = useState<(Channel & { accountEmail: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .channel(id)
      .then((r) => setChannel(r.channel))
      .catch((e) => setError((e as Error).message));
  }, [id]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    reload();
  }, [reload, router]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-danger">{error}</p>
        <Link href="/dashboard" className="text-sm text-accent">
          ← Back to all channels
        </Link>
      </main>
    );
  }

  if (!channel) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading channel…</p>
      </main>
    );
  }

  return (
    <ChannelContext.Provider value={{ channel, reload }}>
      <ChannelShell channel={channel}>{children}</ChannelShell>
    </ChannelContext.Provider>
  );
}
