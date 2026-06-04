import type { Config } from 'tailwindcss';

// Dark-first design system — see DESIGN.md.
// Colors are RGB channel triplets in CSS vars (globals.css) so Tailwind
// opacity utilities (bg-accent/20) keep working, and the UI flips
// dark↔light by toggling the `.light` class on <html>.
const config: Config = {
  darkMode: 'class', // unused for canonical dark; kept for any legacy .dark: prefix
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        'bg-2': 'rgb(var(--c-bg2) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface2) / <alpha-value>)',
        border: 'rgb(var(--c-border) / var(--border-a))',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-2': 'rgb(var(--c-accent2) / <alpha-value>)',
        live: 'rgb(var(--c-live) / <alpha-value>)',
        viral: 'rgb(var(--c-viral) / <alpha-value>)', // legacy alias = live
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        display: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgb(255 255 255 / 0.02), 0 8px 24px -12px rgb(0 0 0 / 0.5)',
        glow: '0 0 0 1px rgb(var(--c-accent) / 0.45), 0 16px 40px -16px rgb(var(--c-accent) / 0.5)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.6' },
          '70%,100%': { transform: 'scale(1.55)', opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.28s cubic-bezier(0.16,1,0.3,1) both',
        marquee: 'marquee 32s linear infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.16,1,0.3,1) infinite',
      },
    },
  },
  plugins: [],
};
export default config;
