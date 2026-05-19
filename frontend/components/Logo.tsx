export default function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <span className={`grid place-items-center rounded-xl ${className}`}>
      <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="ft-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--c-accent))" />
            <stop offset="100%" stopColor="rgb(var(--c-accent2))" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#ft-g)" />
        <path d="M13 10.5l8 5.5-8 5.5z" fill="white" />
      </svg>
    </span>
  );
}
