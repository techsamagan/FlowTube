'use client';
import { useChannel } from '../channel-context';

export default function ChannelAnalytics() {
  const { channel } = useChannel();
  return (
    <>
      <h1 className="mb-8 text-2xl font-semibold">Analytics</h1>
      <div className="glass flex flex-col items-center px-8 py-16 text-center">
        <span className="tag">Next slice</span>
        <p className="mt-4 max-w-md text-sm text-muted">
          Retention curves, per-video performance, and the &ldquo;why it went
          viral&rdquo; breakdown for {channel.name}.
        </p>
      </div>
    </>
  );
}
