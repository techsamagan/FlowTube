'use client';

import { useEffect, useState } from 'react';

// Dark is canonical (per DESIGN.md). This toggle adds/removes `.light` on
// <html>. Pre-paint theme application happens in layout.tsx's inline script.
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(!document.documentElement.classList.contains('light'));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    const root = document.documentElement;
    root.classList.toggle('light', !next);
    root.style.colorScheme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('flowtube-theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={`relative grid h-9 w-9 place-items-center rounded-md border border-border bg-surface text-ink transition-all duration-150 hover:border-accent/45 hover:bg-surface-2 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`absolute h-[18px] w-[18px] transition-all duration-300 ${dark ? 'rotate-0 opacity-100' : 'rotate-90 opacity-0'}`}
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className={`absolute h-[18px] w-[18px] transition-all duration-300 ${dark ? '-rotate-90 opacity-0' : 'rotate-0 opacity-100'}`}
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
