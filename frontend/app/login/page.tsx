'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';
import AuthShell from '@/components/AuthShell';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { token } = await api.login(email, password);
      setToken(token);
      router.push('/dashboard');
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage your channels.">
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <label className="text-sm">
          <span className="eyebrow mb-1.5 block">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field w-full"
            placeholder="you@example.com"
          />
        </label>
        <label className="text-sm">
          <span className="eyebrow mb-1.5 block">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field w-full"
            placeholder="••••••••"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="btn-primary mt-1 w-full py-3"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {err && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {err}
        </p>
      )}

      <p className="mt-6 text-sm text-muted">
        No account?{' '}
        <Link href="/register" className="font-medium text-accent">
          Create one free
        </Link>
      </p>
    </AuthShell>
  );
}
