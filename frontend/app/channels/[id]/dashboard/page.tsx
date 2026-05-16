'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { nicheLabel } from '@/lib/api';
import { useChannel } from '../channel-context';

export default function ChannelDashboard() {
  const { channel } = useChannel();
  const { id } = useParams<{ id: string }>();
  const pending = channel.isAiProposed && !channel.setupCompleted;

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{channel.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {nicheLabel(channel.niche)} · {channel.language} ·{' '}
          {channel.handle ?? 'no handle'}
        </p>
      </header>

      {pending && (
        <div className="mb-6 rounded-md border border-border bg-bg-2 px-4 py-3 text-sm text-muted">
          This channel is AI-proposed and not yet created on YouTube. Finish the
          one-time setup, then re-scan from{' '}
          <Link href="/dashboard" className="text-accent">
            All channels
          </Link>
          .
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Subscribers" value={channel.subscriberCount.toLocaleString()} />
        <Stat label="Total views" value={channel.viewCount.toLocaleString()} />
        <Stat label="Videos" value={channel.videoCount} />
        <Stat label="Account" value={channel.accountEmail} small />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Action
          href={`/channels/${id}/generate`}
          title="Generate a Short"
          body="Write a viral-blueprint script for this channel."
        />
        <Action
          href={`/channels/${id}/trends`}
          title="Analyze trends"
          body="See what to make next and when to post it."
        />
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  small,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="glass p-4">
      <p className="eyebrow">{label}</p>
      <p
        className={`nums mt-1 font-semibold ${small ? 'truncate text-sm' : 'text-xl'}`}
        title={String(value)}
      >
        {value}
      </p>
    </div>
  );
}

function Action({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="glass glass-hover block p-5">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      <span className="mt-3 inline-block text-sm text-accent">Open →</span>
    </Link>
  );
}
