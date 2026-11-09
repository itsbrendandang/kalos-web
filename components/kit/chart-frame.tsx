"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ChartState = "ready" | "loading" | "empty" | "error" | "insufficient";

/**
 * Every chart's frame: title, unit and sample size, a "how this is made"
 * tooltip, and the four honest non-ready states. `insufficient` is for data
 * that exists but cannot support the chart yet (e.g. one round, nothing to
 * trend): it says so instead of drawing a misleading picture.
 */
export function ChartFrame({
  title,
  unit,
  n,
  method,
  state = "ready",
  emptyText = "Nothing to chart yet.",
  insufficientText = "Not enough evidence to draw this yet.",
  onRetry,
  actions,
  height = 260,
  children,
  className,
}: {
  title: ReactNode;
  unit?: ReactNode;
  n?: number | null;
  method?: ReactNode;
  state?: ChartState;
  emptyText?: ReactNode;
  insufficientText?: ReactNode;
  onRetry?: () => void;
  actions?: ReactNode;
  height?: number;
  children: ReactNode;
  className?: string;
}) {
  const sub = [unit, n != null ? `n = ${formatNumber(n, "count")}` : null].filter(Boolean);
  return (
    <figure className={cn("flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-5", className)}>
      <figcaption className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-heading text-fg">
            {title}
            {method ? (
              <Tooltip>
                <TooltipTrigger
                  aria-label="How this chart is made"
                  className="inline-flex rounded-full text-fg-muted hover:text-fg"
                >
                  <Info className="size-4" aria-hidden />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">{method}</TooltipContent>
              </Tooltip>
            ) : null}
          </span>
          {sub.length ? (
            <span className="block text-caption text-fg-muted">
              {sub.map((s, i) => (
                <span key={i}>
                  {i ? " · " : ""}
                  {s}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </figcaption>
      <div style={{ minHeight: height }} className="flex min-w-0 flex-col">
        {state === "ready" ? (
          children
        ) : state === "loading" ? (
          <LoadingSkeleton variant="chart" label="Loading chart" />
        ) : state === "error" ? (
          <ErrorState title="Could not load this chart" description="The request failed. This is a connection problem, not a result." onRetry={onRetry} />
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg bg-subtle px-6 text-center text-body text-fg-muted">
            {state === "empty" ? emptyText : insufficientText}
          </div>
        )}
      </div>
    </figure>
  );
}
