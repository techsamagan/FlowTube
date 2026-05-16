import type { Config } from 'tailwindcss';

// Simple, flat dark system. One font, restrained palette, no decoration.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0c0e',
        'bg-2': '#101113',
        surface: '#131517',
        'surface-2': '#181a1d',
        border: 'rgba(255,255,255,0.09)',
        ink: '#E8E9EA',
        muted: '#9097A0',
        accent: '#4F8EF7',
        viral: '#3FC489',
        danger: '#E5705F',
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        display: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
