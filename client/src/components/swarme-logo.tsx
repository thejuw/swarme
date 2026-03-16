export function SwarmeLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-label="Swarme logo"
    >
      {/* Central hexagonal node */}
      <path
        d="M16 4L26 10V22L16 28L6 22V10L16 4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Inner swarm nodes */}
      <circle cx="16" cy="10" r="1.5" fill="hsl(152, 62%, 48%)" />
      <circle cx="21" cy="16" r="1.5" fill="hsl(152, 62%, 48%)" />
      <circle cx="16" cy="22" r="1.5" fill="hsl(152, 62%, 48%)" />
      <circle cx="11" cy="16" r="1.5" fill="hsl(152, 62%, 48%)" />
      {/* Connection lines between nodes */}
      <line x1="16" y1="10" x2="21" y2="16" stroke="hsl(152, 62%, 48%)" strokeWidth="0.75" opacity="0.6" />
      <line x1="21" y1="16" x2="16" y2="22" stroke="hsl(152, 62%, 48%)" strokeWidth="0.75" opacity="0.6" />
      <line x1="16" y1="22" x2="11" y2="16" stroke="hsl(152, 62%, 48%)" strokeWidth="0.75" opacity="0.6" />
      <line x1="11" y1="16" x2="16" y2="10" stroke="hsl(152, 62%, 48%)" strokeWidth="0.75" opacity="0.6" />
      {/* Central core */}
      <circle cx="16" cy="16" r="2" fill="hsl(152, 62%, 48%)" opacity="0.3" />
      <circle cx="16" cy="16" r="1" fill="hsl(152, 62%, 48%)" />
    </svg>
  );
}
