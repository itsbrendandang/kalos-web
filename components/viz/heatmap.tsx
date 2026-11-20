"use client";

import { useCallback, useState, type KeyboardEvent, type ReactNode } from "react";
import { moveCell, rampVar, type Ramp } from "@/lib/viz-data/heat";

/*
 * Shared heatmap primitives (VIZ_SPEC_V2 2.7): one tab stop per heatmap with
 * arrow-key cell focus and Enter to pin the tooltip, the stepped legend with
 * printed class edges, and the two non-value cell styles (empty n = 0, and
 * not computed / refused: the hatch plus the engine's reason). The hatch
 * pattern itself comes from VizDefs (components/viz/defs.tsx).
 */

export type Cell = { row: number; col: number };

/**
 * Roving focus for a grid. `onActivate(cell, pinned)` shows (or pins, on
 * Enter/Space) the tooltip of the active cell; Escape closes it.
 */
export function useGridFocus(rowLengths: readonly number[], onActivate: (cell: Cell, pinned: boolean) => void, onClose: () => void) {
  const [active, setActive] = useState<Cell | null>(null);
  const [focused, setFocused] = useState(false);
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const at = active ?? { row: 0, col: 0 };
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActive(at);
        onActivate(at, true);
        return;
      }
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const next = active == null && e.key.startsWith("Arrow") ? at : moveCell(at, e.key, rowLengths);
      if (!next) return;
      e.preventDefault();
      setActive(next);
      onActivate(next, false);
    },
    [active, rowLengths, onActivate, onClose],
  );
  const containerProps = {
    tabIndex: 0,
    onKeyDown,
    onFocus: () => {
      setFocused(true);
      const at = active ?? { row: 0, col: 0 };
      if (rowLengths[at.row] > 0) {
        setActive(at);
        onActivate(at, false);
      }
    },
    onBlur: () => {
      setFocused(false);
    },
    style: { outline: "none" },
  };
  return { active, focused, setActive, containerProps };
}

/** The 2px focus ring drawn around the active cell while the grid has focus (outline in --fg). */
export function FocusRing({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <rect x={x + 0.5} y={y + 0.5} width={Math.max(0, w - 1)} height={Math.max(0, h - 1)} rx={3} fill="none" stroke="var(--fg)" strokeWidth={2} pointerEvents="none" aria-hidden />;
}

/** A stepped legend: one swatch per class with its printed edges, then the empty and missing styles when used. */
export function StepLegend({
  ramp,
  title,
  steps,
  empty,
  missing,
  hatchId,
}: {
  ramp: Ramp;
  title: ReactNode;
  steps: { k: number; label: string }[];
  /** Label for the n = 0 style ("0 runs"); omitted when the chart has no empty cells. */
  empty?: string;
  /** Label for the hatched style ("not computed"); omitted when unused. */
  missing?: string;
  hatchId?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
      <span>{title}</span>
      {empty ? (
        <span className="inline-flex items-center gap-1">
          <svg viewBox="0 0 14 10" className="h-2.5 w-3.5 shrink-0" aria-hidden>
            <rect x="0.5" y="0.5" width="13" height="9" rx="2" fill="var(--surface)" stroke="var(--chart-grid)" strokeDasharray="1.5 1.5" />
          </svg>
          {empty}
        </span>
      ) : null}
      {steps.map((s) => (
        <span key={`${s.k}-${s.label}`} className="inline-flex items-center gap-1">
          <svg viewBox="0 0 14 10" className="h-2.5 w-3.5 shrink-0" aria-hidden>
            <rect x="0" y="0" width="14" height="10" rx="2" fill={rampVar(ramp, s.k)} stroke="var(--chart-grid)" strokeWidth={0.5} />
          </svg>
          {s.label}
        </span>
      ))}
      {missing && hatchId ? (
        <span className="inline-flex items-center gap-1">
          <svg viewBox="0 0 14 10" className="h-2.5 w-3.5 shrink-0" aria-hidden>
            <rect x="0" y="0" width="14" height="10" rx="2" fill={`url(#${hatchId}-hatch)`} stroke="var(--chart-refused)" />
          </svg>
          {missing}
        </span>
      ) : null}
    </span>
  );
}

/** The hatch swatch definition for an HTML legend that sits outside the chart's SVG. */
export function LegendHatchDefs({ id }: { id: string }) {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--chart-zone-licensed)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-refused)" strokeWidth="1.5" />
        </pattern>
      </defs>
    </svg>
  );
}
