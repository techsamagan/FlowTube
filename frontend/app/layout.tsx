import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'FlowTube — AI YouTube Shorts & Long-form on Autopilot',
  description:
    'Generate, review and publish viral YouTube Shorts and long-form videos across every channel — script, voice, footage, captions and upload, fully automated.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafc' },
    { media: '(prefers-color-scheme: dark)', color: '#080a0e' },
  ],
};

// Dark is canonical (:root holds dark values). The user can opt into light
// via the ThemeToggle, persisted to localStorage. We deliberately do NOT
// honor prefers-color-scheme — the brand is dark-first and serious-tool;
// light mode is an explicit user choice, not a system inheritance.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('flowtube-theme');var r=document.documentElement;r.classList.toggle('light',t==='light');r.style.colorScheme=t==='light'?'light':'dark';}catch(e){/* default dark */}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
