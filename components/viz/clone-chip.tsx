import type { CloneGlyph } from "@/lib/viz-data/clones";
import { cn } from "@/lib/utils";

/*
 * SV-G5: which clone a run or proposal uses. A category mark (Okabe-Ito hue
 * plus a shape, so it reads in greyscale) and the label, always printed. The
 * mark is filled once a result is measured and hollow while the run is
 * proposed or awaiting (VIZ_SPEC: fill carries measured vs predicted, never hue).
 * Beyond 8 clones the chip is the label alone.
 */
export function CloneMark({ glyph, filled, size = 10 }: { glyph: CloneGlyph; filled: boolean; size?: number }) {
  if (!glyph.shape || !glyph.color) return null;
  const c = glyph.color;
  const common = { fill: filled ? c : "var(--surface)", stroke: c, strokeWidth: 1.5 };
  return (
    <svg viewBox="0 0 10 10" width={size} height={size} className="shrink-0" aria-hidden>
      {glyph.shape === "circle" ? <circle cx="5" cy="5" r="3.75" {...common} /> : null}
      {glyph.shape === "square" ? <rect x="1.25" y="1.25" width="7.5" height="7.5" rx="1" {...common} /> : null}
      {glyph.shape === "triangle" ? <path d="M5 1 L9 8.75 L1 8.75 Z" {...common} strokeLinejoin="round" /> : null}
      {glyph.shape === "diamond" ? <path d="M5 0.75 L9.25 5 L5 9.25 L0.75 5 Z" {...common} strokeLinejoin="round" /> : null}
    </svg>
  );
}

export function CloneChip({ glyph, filled, className, title }: { glyph: CloneGlyph; filled: boolean; className?: string; title?: string }) {
  const state = filled ? "measured" : "proposed or awaiting";
  return (
    <span
      className={cn("inline-flex max-w-full items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 text-caption text-fg", className)}
      title={title ?? `Clone ${glyph.label} (${state})`}
    >
      <CloneMark glyph={glyph} filled={filled} />
      <span className="truncate font-mono">{glyph.label}</span>
      <span className="sr-only">, clone, {state}</span>
    </span>
  );
}
