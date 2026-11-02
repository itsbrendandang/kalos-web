"use client";

import { useMemo } from "react";
import { statsOf, type Series } from "@/lib/review";
import { cn } from "@/lib/utils";

export type PlateMetric = "now" | "peak" | "fall";
const WELL = /^([A-P])(\d{1,2})$/i;

/** Linear 0..1 to one of the five sequential chart steps. */
const step = (x: number) => Math.min(5, Math.max(1, Math.ceil(x * 5) || 1));

/**
 * The plate as the scientist sees it: rows A to H, columns 1 to 12. Colour is
 * the chosen measure at the chosen moment, so a stripe, an edge or a bad corner
 * shows up as a place, not a number. Each well is also a button, so it works
 * from the keyboard and names itself to a screen reader.
 */
export function PlateMap({
  series,
  metric,
  timeIndex,
  selected,
  flagged,
  onSelect,
}: {
  series: Series[];
  metric: PlateMetric;
  timeIndex: number;
  selected: string | null;
  flagged: ReadonlySet<string>;
  onSelect: (name: string) => void;
}) {
  const { grid, rows, cols, lo, hi, plate } = useMemo(() => {
    const parsed = series.map((s) => ({ s, m: s.name.match(WELL) }));
    const plate = parsed.every((p) => p.m) && parsed.length > 0;
    const stats = new Map(series.map((s) => [s.name, statsOf(s)]));
    const val = (s: Series) => {
      if (metric === "peak") return stats.get(s.name)!.peak;
      if (metric === "fall") return stats.get(s.name)!.fallFrac * 100;
      return s.y[Math.min(timeIndex, s.y.length - 1)];
    };
    const values = series.map(val);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const by = new Map(series.map((s, i) => [s.name, values[i]]));
    if (!plate) return { grid: by, rows: [] as string[], cols: [] as number[], lo, hi, plate };
    const rs = [...new Set(parsed.map((p) => p.m![1].toUpperCase()))].sort();
    const r0 = rs[0].charCodeAt(0), r1 = rs[rs.length - 1].charCodeAt(0);
    const cs = parsed.map((p) => Number(p.m![2]));
    const rows = Array.from({ length: r1 - r0 + 1 }, (_, i) => String.fromCharCode(r0 + i));
    const cols = Array.from({ length: Math.max(...cs) - Math.min(...cs) + 1 }, (_, i) => Math.min(...cs) + i);
    return { grid: by, rows, cols, lo, hi, plate };
  }, [series, metric, timeIndex]);

  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
  const unit = metric === "fall" ? "% below peak" : "";
  const cell = (name: string | null) => {
    if (!name || !grid.has(name)) return <span aria-hidden className="size-full rounded-full border border-dashed border-border" />;
    const v = grid.get(name)!;
    const x = hi === lo ? 0.5 : (v - lo) / (hi - lo);
    const on = selected === name;
    return (
      <button
        type="button"
        onClick={() => onSelect(name)}
        aria-pressed={on}
        aria-label={`Well ${name}: ${fmt(v)} ${unit}${metric === "now" ? `, reading ${timeIndex + 1}` : ""}${flagged.has(name) ? ", unusual" : ""}`}
        title={`${name}: ${fmt(v)} ${unit}`}
        style={{ backgroundColor: `var(--chart-seq-${step(x)})` }}
        className={cn("relative size-full rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2", on && "ring-2 ring-fg ring-offset-2 ring-offset-surface")}
      >
        {flagged.has(name) ? <span aria-hidden className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg ring-1 ring-fg" /> : null}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {plate ? (
        <div className="grid items-center gap-1.5" style={{ gridTemplateColumns: `1.25rem repeat(${cols.length}, minmax(0, 1fr))` }} role="group" aria-label="Plate map">
          <span />
          {cols.map((c) => <span key={c} className="text-center text-caption tabular-nums text-fg-muted">{c}</span>)}
          {rows.map((r) => (
            <div key={r} className="contents">
              <span className="text-caption text-fg-muted">{r}</span>
              {cols.map((c) => <div key={c} className="aspect-square">{cell(`${r}${c}`)}</div>)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5" role="group" aria-label="Samples">
          {series.map((s) => <div key={s.name} className="aspect-square" title={s.name}>{cell(s.name)}</div>)}
        </div>
      )}
      <div className="flex items-center gap-2 text-caption tabular-nums text-fg-muted">
        <span>{fmt(lo)}</span>
        <span className="h-2 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, var(--chart-seq-1), var(--chart-seq-3), var(--chart-seq-5))" }} aria-hidden />
        <span>{fmt(hi)} {unit}</span>
      </div>
    </div>
  );
}
