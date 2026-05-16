'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { token } = await api.register(email, password, name);
      setToken(token);
      router.push('/dashboard');
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-muted">
          One account manages all your channels.
        </p>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
          <label className="text-sm">
            <span className="eyebrow mb-1 block">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field w-full"
              placeholder="Your name"
            />
          </label>
          <label className="text-sm">
            <span className="eyebrow mb-1 block">Email</span>
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
            <span className="eyebrow mb-1 block">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field w-full"
              placeholder="At least 8 characters"
            />
          </label>
          <button type="submit" disabled={busy} className="btn-primary mt-1 w-full">
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>

        {err && <p className="mt-4 text-sm text-danger">{err}</p>}

        <p className="mt-6 text-sm text-muted">
          Already have an account?{' '}
          <Link href="/" className="text-accent">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
