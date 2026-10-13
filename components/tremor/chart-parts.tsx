// Adapted from Tremor, https://github.com/tremorlabs/tremor, Apache-2.0 (see ./NOTICE).
// Source: the Legend and ChartTooltip parts shared by LineChart.tsx and BarChart.tsx [v1.0.0].
// Modified: one shared copy; Kalos tokens; the legend is plain HTML (no slider,
// no click-to-filter); tooltip payload is typed.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getColorClassName, type ChartColor } from "@/components/tremor/chart-utils";

export type LegendEntry = { name: string; color: ChartColor; swatch?: "line" | "solid" | "outline" };

export function ChartLegend({ items, align = "right" }: { items: LegendEntry[]; align?: "left" | "center" | "right" }) {
  return (
    <ul
      className={cn(
        "flex flex-wrap gap-x-4 gap-y-1 pb-2 text-caption text-fg-muted",
        align === "center" ? "justify-center" : align === "left" ? "justify-start" : "justify-end",
      )}
    >
      {items.map((item) => (
        <li key={item.name} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden
            className={cn(
              "shrink-0 rounded-full",
              item.swatch === "line" || item.swatch == null ? "h-[3px] w-3.5" : "size-2.5 rounded-sm",
              item.swatch === "outline" ? cn("border-[1.5px]", getColorClassName(item.color, "text"), "border-current") : getColorClassName(item.color, "bg"),
            )}
          />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

export type TooltipRow = { name: string; value: string; color: ChartColor };

/** The tooltip box: a title row, then one row per series. */
export function ChartTooltipBox({ label, rows, children }: { label: ReactNode; rows?: TooltipRow[]; children?: ReactNode }) {
  return (
    <div className="min-w-36 rounded-lg border border-border bg-surface text-caption shadow-popover">
      <div className="border-b border-border px-3 py-1.5 text-label text-fg">{label}</div>
      <div className="space-y-1 px-3 py-1.5">
        {rows?.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-fg-muted">
              <span aria-hidden className={cn("h-[3px] w-3.5 shrink-0 rounded-full", getColorClassName(r.color, "bg"))} />
              {r.name}
            </span>
            <span className="text-fg tabular-nums">{r.value}</span>
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}

/** Axis title styling shared by both charts. */
export const AXIS_LABEL_CLASS = "fill-fg-muted text-caption";
/** Tick text: Geist, tabular, muted. */
export const AXIS_TICK_CLASS = "fill-fg-muted text-caption tabular-nums";
