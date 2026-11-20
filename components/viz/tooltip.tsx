"use client";

import { useCallback, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/*
 * Hover / pin tooltip for chart marks (VIZ_SPEC 2.7). Hover shows it; click or
 * Enter pins it so its source can be read and copied; Escape or the close
 * button unpins. Positioned inside the chart's relative container.
 */
export type TipState = { x: number; y: number; content: ReactNode; pinned: boolean } | null;

export function useChartTip() {
  const [tip, setTip] = useState<TipState>(null);
  const show = useCallback((x: number, y: number, content: ReactNode) => setTip((t) => (t?.pinned ? t : { x, y, content, pinned: false })), []);
  const hide = useCallback(() => setTip((t) => (t?.pinned ? t : null)), []);
  const pin = useCallback((x: number, y: number, content: ReactNode) => setTip({ x, y, content, pinned: true }), []);
  const close = useCallback(() => setTip(null), []);
  /** Props for an SVG mark (or its hit target) that shows `content` at (x, y). */
  const markProps = useCallback(
    (x: number, y: number, content: ReactNode, label: string, focusable = true) => ({
      onMouseEnter: () => show(x, y, content),
      onMouseLeave: hide,
      onClick: () => pin(x, y, content),
      onFocus: () => show(x, y, content),
      onBlur: hide,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pin(x, y, content);
        }
        if (e.key === "Escape") close();
      },
      tabIndex: focusable ? 0 : -1,
      role: "button" as const,
      "aria-label": label,
      style: { cursor: "pointer", outline: "none" },
    }),
    [show, hide, pin, close],
  );
  return { tip, markProps, close };
}

export function ChartTooltip({ tip, onClose, width }: { tip: TipState; onClose: () => void; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x + 12, 0), Math.max(0, width - 260));
  return (
    <div
      role={tip.pinned ? "dialog" : "tooltip"}
      aria-label={tip.pinned ? "Mark details" : undefined}
      className="pointer-events-auto absolute z-20 w-64 rounded-md border border-border bg-surface p-2.5 text-caption text-fg shadow-popover"
      style={{ left, top: Math.max(0, tip.y - 8) }}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      {tip.pinned ? (
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-1 right-1 grid size-6 place-items-center rounded text-fg-muted hover:bg-subtle hover:text-fg">
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
      {tip.content}
    </div>
  );
}

/** One "label value" line inside a tooltip. */
export function TipRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-fg-muted">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}

/** The source footer every tooltip ends with. */
export function TipSource({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 border-t border-border pt-1.5 text-fg-muted">Source: {children}</div>;
}
