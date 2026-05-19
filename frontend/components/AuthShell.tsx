'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';

/**
 * Two-pane auth layout: a branded, animated panel on the left (hidden on
 * small screens) and the form on the right. Fully responsive + theme-aware.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="relative grid min-h-screen lg:grid-cols-2">
      {/* brand panel */}
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="aurora-blob left-[-10%] top-[-10%] h-96 w-96 animate-aurora bg-accent/40" />
        <div className="aurora-blob bottom-[-12%] right-[-8%] h-96 w-96 animate-aurora bg-accent-2/40 [animation-delay:-8s]" />

        <Link href="/" className="relative flex items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="text-xl font-semibold tracking-tight">
            Flow<span className="text-gradient">Tube</span>
          </span>
        </Link>

        <div className="relative">
          <h2 className="text-balance text-4xl font-bold leading-tight tracking-tight">
            Your YouTube channel,{' '}
            <span className="text-gradient">on autopilot</span>.
          </h2>
          <p className="mt-4 max-w-md text-pretty text-muted">
            Script, voice, footage, captions and upload — automated across
            every channel. You just approve the bangers.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              'AI scripts graded by a viral score',
              'Studio-grade voiceover in 10 languages',
              'You approve every upload',
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-sm">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-viral/15 text-viral">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted">
          © {new Date().getFullYear()} FlowTube · AI YouTube automation
        </p>
      </aside>

      {/* form panel */}
      <section className="relative flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
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
            Back home
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-fade-up">
            <div className="lg:hidden">
              <Logo className="h-10 w-10" />
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight lg:mt-0">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted">{subtitle}</p>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
