"use client";

import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { ExampleBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/honest-state";
import { InsufficientBlock, NotScoredBlock, RefusalBlock } from "@/components/viz/refusal";
import { useWidth } from "@/components/viz/use-width";
import { cn } from "@/lib/utils";

export type VizState =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "empty"; text: ReactNode }
  | { kind: "insufficient"; text: ReactNode }
  | { kind: "refused"; reasons: string[]; fix?: string[] }
  | { kind: "not-scored"; reason: string }
  | { kind: "error"; onRetry?: () => void };

export type DataTable = { columns: string[]; rows: (string | number)[][]; caption?: string };

/**
 * ChartFrame v2 (VIZ_SPEC 3.5, 3.8): a <figure> with title and subtitle, the
 * designed non-ready states (no ghost chart behind any of them), a stale
 * banner, the chart, its legend, a "Data" disclosure with the plotted values
 * as a table (also the print and copy path), and one source footer line.
 * `children` receives the measured width (null until mounted: a fixed-height
 * skeleton renders instead, so server and client markup match).
 */
export function ChartFrame({
  title,
  subtitle,
  state = { kind: "ready" },
  stale,
  legend,
  data,
  footer,
  actions,
  demo = false,
  height = 280,
  width: fixedWidth,
  description,
  children,
  className,
  bare = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  state?: VizState;
  stale?: { nNew: number; text?: ReactNode } | null;
  legend?: ReactNode;
  data?: DataTable | null;
  footer?: ReactNode;
  actions?: ReactNode;
  demo?: boolean;
  height?: number;
  width?: number;
  /** Plain-language description of what the chart shows (also the SVG's aria-label). */
  description?: string;
  children: (width: number) => ReactNode;
  className?: string;
  /** No border/padding (when nested in a panel that already has one). */
  bare?: boolean;
}) {
  const { ref, width } = useWidth<HTMLDivElement>(fixedWidth);
  return (
    <figure className={cn("flex min-w-0 flex-col gap-3", !bare && "rounded-xl border border-border bg-surface p-panel", className)}>
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <span className="flex flex-wrap items-center gap-2 text-heading text-fg">
            {title}
            {demo ? <ExampleBadge /> : null}
          </span>
          {subtitle ? <span className="mt-0.5 block text-caption text-fg-muted">{subtitle}</span> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </figcaption>
      {stale && state.kind === "ready" ? (
        <p className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-caption text-fg">
          <RefreshCw className="size-3.5 shrink-0 text-warn" aria-hidden />
          {stale.text ?? `The analysis predates ${stale.nNew === 1 ? "1 recorded result" : `${stale.nNew} recorded results`}. Re-analyze to update.`}
        </p>
      ) : null}
      <div ref={ref} className="relative flex min-w-0 flex-col">
        {state.kind === "ready" ? (
          width == null || width === 0 ? (
            <div aria-hidden className="w-full animate-pulse rounded-lg bg-subtle motion-reduce:animate-none" style={{ height }} />
          ) : (
            children(width)
          )
        ) : state.kind === "loading" ? (
          <div role="status" aria-label="Loading chart" className="w-full animate-pulse rounded-lg bg-subtle motion-reduce:animate-none" style={{ height }} />
        ) : state.kind === "error" ? (
          <ErrorState title="Could not load this chart" description="The request failed. This is a connection problem, not a result." onRetry={state.onRetry} />
        ) : state.kind === "refused" ? (
          <RefusalBlock reasons={state.reasons} fix={state.fix} />
        ) : state.kind === "not-scored" ? (
          <NotScoredBlock reason={state.reason} />
        ) : (
          <InsufficientBlock>{state.text}</InsufficientBlock>
        )}
      </div>
      {state.kind === "ready" && legend ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted">{legend}</div> : null}
      {state.kind === "ready" && description ? <p className="sr-only">{description}</p> : null}
      {data && data.rows.length > 0 && (state.kind === "ready" || state.kind === "insufficient") ? (
        <Disclosure summary="Data" meta={`${data.rows.length} ${data.rows.length === 1 ? "row" : "rows"}`} className="print:hidden">
          <DataTableView data={data} />
        </Disclosure>
      ) : null}
      {footer ? <p className="text-caption text-fg-muted">{footer}</p> : null}
    </figure>
  );
}

export function DataTableView({ data }: { data: DataTable }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-caption tabular-nums">
        {data.caption ? <caption className="mb-1 text-left text-fg-muted">{data.caption}</caption> : null}
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-border">
            {data.columns.map((c, i) => (
              <th key={c} scope="col" className={cn("py-1.5 pr-3 font-medium text-fg-muted", i === 0 ? "text-left" : "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {r.map((cell, j) => (
                <td key={j} className={cn("py-1.5 pr-3 text-fg", j === 0 ? "text-left" : "text-right")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Legend entries: the canonical mark beside its word. */
export function LegendItem({ mark, children }: { mark: "measured" | "predicted" | "band" | "reference" | "pending" | "derived" | "outside" | "hatch"; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg viewBox="0 0 16 10" className="h-2.5 w-4 shrink-0" aria-hidden>
        {mark === "measured" ? <circle cx="8" cy="5" r="4" fill="var(--chart-measured)" /> : null}
        {mark === "predicted" ? <circle cx="8" cy="5" r="3.5" fill="var(--surface)" stroke="var(--chart-predicted)" strokeWidth="1.5" /> : null}
        {mark === "pending" ? <circle cx="8" cy="5" r="3.5" fill="var(--surface)" stroke="var(--chart-measured)" strokeWidth="1.25" strokeDasharray="2 2" /> : null}
        {mark === "band" ? <rect x="0" y="1" width="16" height="8" rx="2" fill="var(--chart-band)" /> : null}
        {mark === "reference" ? <line x1="0" x2="16" y1="5" y2="5" stroke="var(--chart-reference)" strokeWidth="1.5" strokeDasharray="1 3" strokeLinecap="round" /> : null}
        {mark === "derived" ? <path d="M8 1 L12 5 L8 9 L4 5 Z" fill="var(--chart-reference)" /> : null}
        {mark === "outside" ? (
          <g stroke="var(--warn)" strokeWidth="1.75" strokeLinecap="round">
            <line x1="5" x2="11" y1="2" y2="8" />
            <line x1="5" x2="11" y1="8" y2="2" />
          </g>
        ) : null}
        {mark === "hatch" ? <rect x="0" y="0" width="16" height="10" rx="2" fill="var(--chart-zone-licensed)" stroke="var(--chart-refused)" /> : null}
      </svg>
      {children}
    </span>
  );
}
