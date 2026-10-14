import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatNumber, type Quantity } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MetricDelta = {
  value: number;
  /** What the change is measured against, e.g. "vs round 2". */
  context: string;
  quantity?: Quantity;
  /** Which direction is good news; "neither" keeps the delta neutral. */
  better?: "up" | "down" | "neither";
};

/**
 * A number with its label, unit and one line under it: either a delta (with a
 * sign, a direction word and an icon, so it never rides on colour) or, when no
 * honest delta exists, a qualifier such as the confidence interval. Never
 * invent a delta. Numbers go through the one formatter; strings pass as-is.
 * Headline rows are hairline-divided Metrics, not boxed cards.
 */
export function Metric({
  label,
  value,
  unit,
  quantity = "value",
  delta,
  qualifier,
  badge,
  size = "md",
  className,
}: {
  label: ReactNode;
  value: number | string | null | undefined;
  unit?: ReactNode;
  quantity?: Quantity;
  delta?: MetricDelta | null;
  qualifier?: ReactNode;
  /** A small status badge beside the label, e.g. the reliability verdict. */
  badge?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const shown = typeof value === "string" ? value : formatNumber(value, quantity);
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-label text-fg-muted">{label}</div>
        {badge}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={cn("text-fg tabular-nums", size === "lg" ? "text-metric" : size === "md" ? "text-title" : "text-heading")}>
          {shown}
        </span>
        {unit && value != null ? <span className="text-body text-fg-muted">{unit}</span> : null}
      </div>
      {delta ? <DeltaLine delta={delta} /> : qualifier ? <div className="mt-0.5 text-caption text-fg-muted">{qualifier}</div> : null}
    </div>
  );
}

function DeltaLine({ delta }: { delta: MetricDelta }) {
  const shown = formatNumber(delta.value, delta.quantity ?? "value", { sign: true });
  const flat = Number(shown.replace(/[^\d.]/g, "")) === 0;
  const dir = flat ? "flat" : delta.value > 0 ? "up" : "down";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const tone =
    dir === "flat" || delta.better === "neither" || delta.better == null ? "text-fg-muted" : dir === delta.better ? "text-good" : "text-bad";
  const word = dir === "flat" ? "no change" : dir;
  return (
    <p className="mt-0.5 flex items-center gap-1 text-caption text-fg-muted">
      <Icon className={cn("size-3.5 shrink-0", tone)} aria-hidden />
      <span className={cn("tabular-nums", tone)}>{shown}</span>
      <span>
        {word} {delta.context}
      </span>
    </p>
  );
}
