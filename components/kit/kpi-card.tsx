import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/tremor/card";
import { formatNumber, type Quantity } from "@/lib/format";
import { cn } from "@/lib/utils";

export type KpiDelta = {
  value: number;
  /** What the change is measured against, e.g. "vs round 2". */
  context: string;
  quantity?: Quantity;
  /** Which direction is good news; "neither" keeps the delta neutral. */
  better?: "up" | "down" | "neither";
};

/**
 * One headline number on Tremor's card/metric look. Either a delta (with a
 * sign, a direction word and an icon, so it never rides on colour) or, when
 * no honest delta exists, a qualifier such as the confidence interval. Never
 * invent a delta.
 */
export function KpiCard({
  label,
  value,
  unit,
  quantity = "value",
  delta,
  qualifier,
  badge,
  className,
}: {
  label: ReactNode;
  value: number | string | null | undefined;
  unit?: ReactNode;
  quantity?: Quantity;
  delta?: KpiDelta | null;
  qualifier?: ReactNode;
  /** A small status badge beside the label, e.g. the reliability verdict. */
  badge?: ReactNode;
  className?: string;
}) {
  const shown = typeof value === "string" ? value : formatNumber(value, quantity);
  return (
    <Card className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-label text-fg-muted">{label}</p>
        {badge}
      </div>
      <p className="flex items-baseline gap-1.5">
        <span className="text-metric text-fg tabular-nums">{shown}</span>
        {unit && value != null ? <span className="text-body text-fg-muted">{unit}</span> : null}
      </p>
      {delta ? <DeltaLine delta={delta} /> : qualifier ? <p className="text-caption text-fg-muted">{qualifier}</p> : null}
    </Card>
  );
}

function DeltaLine({ delta }: { delta: KpiDelta }) {
  const shown = formatNumber(delta.value, delta.quantity ?? "value", { sign: true });
  const flat = Number(shown.replace(/[^\d.]/g, "")) === 0;
  const dir = flat ? "flat" : delta.value > 0 ? "up" : "down";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const tone =
    dir === "flat" || delta.better === "neither" || delta.better == null ? "text-fg-muted" : dir === delta.better ? "text-good" : "text-bad";
  const word = dir === "flat" ? "no change" : dir;
  return (
    <p className="flex items-center gap-1 text-caption text-fg-muted">
      <Icon className={cn("size-3.5 shrink-0", tone)} aria-hidden />
      <span className={cn("tabular-nums", tone)}>{shown}</span>
      <span>
        {word} {delta.context}
      </span>
    </p>
  );
}
