import { cn } from "@/lib/utils";

/**
 * The Kalos mark: a laurel wreath (the Delphic victor's crown) around a K.
 * Draws in currentColor, so it follows the theme.
 */
export function KalosMark({ className }: { className?: string }) {
  const leaves = [0, 1, 2, 3, 4];
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn("size-7", className)}>
      {[1, -1].map((side) => (
        <g key={side} transform={side === 1 ? undefined : "translate(32 0) scale(-1 1)"}>
          <path d="M9.2 26.5C4.6 22.8 3.2 16.4 5.6 9.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          {leaves.map((i) => {
            const t = i / 4;
            const x = 8.2 - Math.sin(t * 1.9) * 3.9 + 0.5;
            const y = 24.2 - t * 14.4;
            return <ellipse key={i} cx={x - 1.6} cy={y} rx="2.3" ry="1.05" transform={`rotate(${-50 - t * 40} ${x - 1.6} ${y})`} fill="currentColor" />;
          })}
        </g>
      ))}
      <path d="M13 10.5v11M13 16.2l6-5.7M14.6 15l5.4 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

