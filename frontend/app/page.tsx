'use client';

import { useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import { Reveal, Counter } from '@/components/Reveal';

/* ───────────────────────── data ───────────────────────── */

const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#pipeline', label: 'Pipeline' },
  { href: '#faq', label: 'FAQ' },
];

const NICHES = [
  'Finance & Money',
  'Motivation',
  'Tech & Gadgets',
  'Health & Fitness',
  'Cooking',
  'Business',
  'Psychology',
  'Facts & Education',
  'Luxury Lifestyle',
];

const STEPS = [
  {
    n: '01',
    title: 'Connect your channel',
    body: 'Sign in with Google and FlowTube auto-detects every YouTube channel on your account. Manage them all from one place.',
  },
  {
    n: '02',
    title: 'Pick a niche, let AI plan',
    body: 'Choose a niche and language. The trend radar studies what is going viral and fills a content calendar with topics worth making.',
  },
  {
    n: '03',
    title: 'Approve & auto-publish',
    body: 'Every video is scripted, voiced, edited and reviewed automatically. You get the final say before it publishes to YouTube.',
  },
];

const FEATURES = [
  {
    title: 'AI scripts with a viral score',
    body: 'Claude writes hook-first scripts engineered for retention, then grades each one so you only ship the bangers.',
    icon: 'M4 5h16M4 12h16M4 19h10',
    span: 'lg:col-span-2',
  },
  {
    title: 'Studio-grade voiceover',
    body: 'Lifelike narration in 10 languages, matched to your channel’s tone.',
    icon: 'M12 3v18M8 7v10M16 7v10M4 10v4M20 10v4',
  },
  {
    title: 'Auto B-roll & footage',
    body: 'Relevant stock footage is sourced and cut to the script — no editing.',
    icon: 'M3 5h18v14H3zM3 9h18M9 5v14',
  },
  {
    title: 'Burned-in captions',
    body: 'Word-by-word captions that lift watch time on every short.',
    icon: 'M4 6h16v12H4zM7 14h4M14 14h3',
  },
  {
    title: 'Trend radar',
    body: 'Scans your niche for rising hooks, topics and the best time to post — then turns it into a plan.',
    icon: 'M3 17l6-6 4 4 8-8M21 7v6M21 7h-6',
    span: 'lg:col-span-2',
  },
  {
    title: 'Content calendar',
    body: 'A self-filling schedule that keeps every channel posting consistently.',
    icon: 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4',
  },
  {
    title: 'Human approval gate',
    body: 'Nothing hits YouTube until you press publish. Full control, zero busywork.',
    icon: 'M5 13l4 4L19 7',
  },
];

const PIPELINE: Record<
  'short' | 'long',
  { tag: string; stages: { name: string; detail: string }[] }
> = {
  short: {
    tag: 'Short · 10–30s',
    stages: [
      { name: 'Script', detail: 'Hook-first, 1 idea, loopable ending' },
      { name: 'Voice', detail: 'Punchy narration, tight pacing' },
      { name: 'Footage', detail: 'Fast-cut vertical B-roll' },
      { name: 'Captions', detail: 'Word-by-word, high-contrast' },
      { name: 'AI review', detail: 'Retention + hook scored' },
      { name: 'Publish', detail: 'One tap to YouTube Shorts' },
    ],
  },
  long: {
    tag: 'Long · 4–10 min',
    stages: [
      { name: 'Script', detail: 'Structured chapters & payoff' },
      { name: 'Voice', detail: 'Narrative, documentary tone' },
      { name: 'Footage', detail: 'Scene-matched 16:9 footage' },
      { name: 'Captions', detail: 'Readable, chaptered subtitles' },
      { name: 'AI review', detail: 'Story arc + watch-time scored' },
      { name: 'Publish', detail: 'Title, tags & upload handled' },
    ],
  },
};

const QUOTES = [
  {
    q: 'I went from one upload a week to a daily short on three channels. The viral score is scary accurate.',
    a: 'Maya R.',
    r: 'Finance creator',
  },
  {
    q: 'The trend radar basically tells me what to make. I just approve and it ships overnight.',
    a: 'Devon K.',
    r: 'Faceless channel operator',
  },
  {
    q: 'Captions, voice, footage — all handled. It feels like an editing team that never sleeps.',
    a: 'Priya S.',
    r: 'Health & fitness',
  },
];

const FAQ = [
  {
    q: 'Do I need any video editing skills?',
    a: 'None. FlowTube handles the script, voiceover, footage, captions and upload end to end. You pick the niche and approve the result.',
  },
  {
    q: 'Will videos publish without my approval?',
    a: 'Never. Every video stops at a human approval gate with an AI review and viral score. Nothing goes to YouTube until you press publish.',
  },
  {
    q: 'Can I run more than one channel?',
    a: 'Yes. One account detects and manages every channel on your Google login, each with its own niche, language and calendar.',
  },
  {
    q: 'What languages are supported?',
    a: 'Scripts and voiceover are available in 10 languages including English, Spanish, Hindi, Portuguese, Arabic, French, German, Russian, Japanese and Indonesian.',
  },
  {
    q: 'How much does it cost to start?',
    a: 'You can create an account and explore the full workflow for free — no credit card required to get started.',
  },
];

/* ───────────────────────── page ───────────────────────── */

export default function LandingPage() {
  const [menu, setMenu] = useState(false);
  const [fmt, setFmt] = useState<'short' | 'long'>('short');
  const [faq, setFaq] = useState<number | null>(0);

  return (
    <div className="relative overflow-x-clip">
      {/* ambient aurora */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="aurora-blob left-[-10%] top-[-8%] h-[42vw] w-[42vw] animate-aurora bg-accent/40" />
        <div className="aurora-blob right-[-12%] top-[6%] h-[38vw] w-[38vw] animate-aurora bg-accent-2/40 [animation-delay:-7s]" />
        <div className="aurora-blob bottom-[-12%] left-[28%] h-[40vw] w-[40vw] animate-aurora bg-viral/25 [animation-delay:-13s]" />
      </div>

      {/* ───────── nav ───────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-bg/70 backdrop-blur-xl">
        <nav className="section flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">
              Flow<span className="text-gradient">Tube</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="btn-ghost hidden sm:inline-flex"
            >
              Sign in
            </Link>
            <Link href="/register" className="btn-primary">
              Get started
            </Link>
            <button
              onClick={() => setMenu((m) => !m)}
              aria-label="Menu"
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-ink md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                {menu ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>
        </nav>

        {menu && (
          <div className="border-t border-border bg-bg/95 px-5 py-3 md:hidden">
            {NAV.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenu(false)}
                className="block rounded-lg px-3 py-3 text-sm text-muted hover:bg-surface-2 hover:text-ink"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/login"
              className="btn-ghost mt-2 w-full"
              onClick={() => setMenu(false)}
            >
              Sign in
            </Link>
          </div>
        )}
      </header>

      {/* ───────── hero ───────── */}
      <section className="relative">
        <div className="grid-bg pointer-events-none absolute inset-0 -z-10" />
        <div className="section grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2 lg:gap-8 lg:py-28">
          <div className="animate-fade-up">
            <span className="pill">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-viral" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-viral" />
              </span>
              Generating in 10 languages, right now
            </span>

            <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Your YouTube channel,{' '}
              <span className="text-gradient">fully on autopilot</span>.
            </h1>

            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
              FlowTube scripts, voices, edits, captions and uploads viral
              Shorts and long-form videos across every channel you own — you
              just approve the bangers.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="btn-primary px-6 py-3 text-base"
              >
                Start free — no card
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <a href="#how" className="btn-ghost px-6 py-3 text-base">
                See how it works
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
              {[
                'No editing skills',
                'Multi-channel',
                'You approve every upload',
              ].map((t) => (
                <span key={t} className="flex items-center gap-2">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-viral"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* product mock */}
          <div className="animate-fade-up [animation-delay:120ms]">
            <HeroMock />
          </div>
        </div>

        {/* niche marquee */}
        <div className="border-y border-border bg-surface/40 py-5">
          <div className="edge-fade overflow-hidden">
            <div className="flex w-max animate-marquee gap-3">
              {[...NICHES, ...NICHES].map((n, i) => (
                <span
                  key={i}
                  className="whitespace-nowrap rounded-full border border-border bg-surface px-4 py-2 text-sm text-muted"
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── stats ───────── */}
      <section className="section py-16 sm:py-20">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { v: 12, s: 'k+', l: 'Videos generated' },
            { v: 10, s: '', l: 'Languages' },
            { v: 92, s: '%', l: 'Avg viral score' },
            { v: 24, s: '/7', l: 'Always producing' },
          ].map((m, i) => (
            <Reveal
              key={m.l}
              delay={i * 80}
              className="card p-6 text-center sm:p-8"
            >
              <div className="text-3xl font-bold tracking-tight text-gradient sm:text-4xl">
                <Counter to={m.v} suffix={m.s} />
              </div>
              <div className="mt-1.5 text-sm text-muted">{m.l}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── how it works ───────── */}
      <section id="how" className="section scroll-mt-20 py-16 sm:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">How it works</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            From zero to published in three steps
          </h2>
          <p className="mt-4 text-muted">
            Set it up once. FlowTube keeps your channels fed while you sleep.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 110}>
              <div className="card glass-hover relative h-full p-7">
                <span className="text-5xl font-bold text-accent/15">
                  {s.n}
                </span>
                <h3 className="mt-3 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">
                  {s.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── features ───────── */}
      <section id="features" className="section scroll-mt-20 py-16 sm:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Everything included</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            A full content team, automated
          </h2>
          <p className="mt-4 text-muted">
            Every part of the pipeline that used to need a person — handled.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal
              key={f.title}
              delay={(i % 3) * 90}
              className={f.span ?? ''}
            >
              <div className="card glass-hover group h-full p-7">
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface-2 text-accent transition-colors group-hover:border-accent/40">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={f.icon} />
                  </svg>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {f.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── pipeline ───────── */}
      <section id="pipeline" className="section scroll-mt-20 py-16 sm:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">The pipeline</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            One topic in. A finished video out.
          </h2>
          <p className="mt-4 text-muted">
            Watch the same engine adapt to short-form and long-form.
          </p>
        </Reveal>

        <Reveal className="mt-10">
          <div className="mx-auto flex w-fit rounded-full border border-border bg-surface p-1">
            {(['short', 'long'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFmt(k)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                  fmt === k
                    ? 'bg-gradient-to-r from-accent to-accent-2 text-white shadow'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {k === 'short' ? 'Short-form' : 'Long-form'}
              </button>
            ))}
          </div>

          <div className="mt-4 text-center text-sm text-muted">
            {PIPELINE[fmt].tag}
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {PIPELINE[fmt].stages.map((st, i) => (
              <div
                key={st.name}
                className="card relative p-5 transition-all hover:-translate-y-1"
                style={{ animation: 'fade-up 0.5s both', animationDelay: `${i * 70}ms` }}
              >
                <span className="text-xs font-semibold text-accent">
                  Step {i + 1}
                </span>
                <h4 className="mt-1.5 font-semibold">{st.name}</h4>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {st.detail}
                </p>
                {i < PIPELINE[fmt].stages.length - 1 && (
                  <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-border lg:block">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-muted"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                )}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ───────── testimonials ───────── */}
      <section className="section py-16 sm:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Loved by operators</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Creators who stopped editing
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {QUOTES.map((t, i) => (
            <Reveal key={t.a} delay={i * 100}>
              <figure className="card glass-hover h-full p-7">
                <div className="flex gap-0.5 text-accent">
                  {Array.from({ length: 5 }).map((_, k) => (
                    <svg
                      key={k}
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="currentColor"
                    >
                      <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
                    </svg>
                  ))}
                </div>
                <blockquote className="mt-4 text-pretty leading-relaxed">
                  “{t.q}”
                </blockquote>
                <figcaption className="mt-5 text-sm">
                  <span className="font-semibold">{t.a}</span>
                  <span className="text-muted"> · {t.r}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── faq ───────── */}
      <section id="faq" className="section scroll-mt-20 py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <span className="eyebrow">FAQ</span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Questions, answered
            </h2>
            <p className="mt-4 text-muted">
              Still unsure?{' '}
              <Link href="/register" className="text-accent">
                Just try it free
              </Link>{' '}
              — it explains itself.
            </p>
          </Reveal>

          <Reveal className="flex flex-col gap-3">
            {FAQ.map((item, i) => {
              const open = faq === i;
              return (
                <div key={item.q} className="card overflow-hidden">
                  <button
                    onClick={() => setFaq(open ? null : i)}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left"
                  >
                    <span className="font-medium">{item.q}</span>
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-5 w-5 shrink-0 text-muted transition-transform duration-300 ${
                        open ? 'rotate-45' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  <div
                    className={`grid transition-all duration-300 ${
                      open
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-sm leading-relaxed text-muted">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </Reveal>
        </div>
      </section>

      {/* ───────── cta ───────── */}
      <section className="section py-16 sm:py-24">
        <Reveal>
          <div className="card relative overflow-hidden p-10 text-center sm:p-16">
            <div className="aurora-blob left-1/4 top-0 h-64 w-64 animate-aurora bg-accent/40" />
            <div className="aurora-blob right-1/4 bottom-0 h-64 w-64 animate-aurora bg-accent-2/40 [animation-delay:-9s]" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Start shipping videos{' '}
                <span className="text-gradient">tonight</span>.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted">
                Connect a channel, pick a niche, and approve your first
                AI-made video in minutes.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="btn-primary px-7 py-3.5 text-base"
                >
                  Create free account
                </Link>
                <Link
                  href="/login"
                  className="btn-ghost px-7 py-3.5 text-base"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ───────── footer ───────── */}
      <footer className="border-t border-border">
        <div className="section flex flex-col items-center justify-between gap-4 py-10 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <Logo className="h-7 w-7" />
            <span className="font-semibold">
              Flow<span className="text-gradient">Tube</span>
            </span>
          </div>
          <p className="text-sm text-muted">
            © {new Date().getFullYear()} FlowTube. AI YouTube automation.
          </p>
          <div className="flex gap-5 text-sm text-muted">
            <a href="#features" className="hover:text-ink">
              Features
            </a>
            <a href="#faq" className="hover:text-ink">
              FAQ
            </a>
            <Link href="/login" className="hover:text-ink">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ──────────────── hero product mock ──────────────── */

function HeroMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-accent/20 to-accent-2/20 blur-2xl" />
      <div className="card overflow-hidden shadow-card">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-danger/70" />
          <span className="h-3 w-3 rounded-full bg-accent/40" />
          <span className="h-3 w-3 rounded-full bg-viral/70" />
          <span className="ml-3 text-xs text-muted">
            flowtube · finance channel
          </span>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted">Now generating</div>
              <div className="font-semibold">
                “3 money habits that quietly build wealth”
              </div>
            </div>
            <span className="rounded-full bg-viral/15 px-2.5 py-1 text-xs font-semibold text-viral">
              Viral 94
            </span>
          </div>

          {/* animated pipeline bars */}
          <div className="space-y-3">
            {[
              { l: 'Script', p: '100%', done: true },
              { l: 'Voiceover', p: '100%', done: true },
              { l: 'Footage + cut', p: '78%', done: false },
              { l: 'Captions', p: '32%', done: false },
            ].map((row) => (
              <div key={row.l}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted">{row.l}</span>
                  <span
                    className={
                      row.done ? 'text-viral' : 'text-accent'
                    }
                  >
                    {row.done ? 'Done' : 'Working…'}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                    style={{ width: row.p }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              { k: 'Length', v: '0:24' },
              { k: 'Language', v: 'English' },
              { k: 'Status', v: 'Review' },
            ].map((c) => (
              <div
                key={c.k}
                className="rounded-xl border border-border bg-surface-2 p-3 text-center"
              >
                <div className="text-[11px] text-muted">{c.k}</div>
                <div className="mt-0.5 text-sm font-semibold">{c.v}</div>
              </div>
            ))}
          </div>

          <button className="btn-primary w-full">
            Approve & publish to YouTube
          </button>
        </div>
      </div>

      {/* floating chips */}
      <div className="absolute -left-4 top-16 hidden animate-float rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-card sm:block">
        🔥 Trend detected
      </div>
      <div className="absolute -right-4 bottom-20 hidden animate-float rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-card [animation-delay:-3s] sm:block">
        ✅ Uploaded · 3 channels
      </div>
    </div>
  );
}
