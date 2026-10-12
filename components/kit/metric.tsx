import type { ReactNode } from "react";
import { formatNumber, type Quantity } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * An inline number with its label, unit and qualifier (e.g. "95% CI 0.12 to
 * 0.45"). Numbers go through the one formatter; strings pass through as-is.
 * For a headline KPI with a delta, use KpiCard.
 */
export function Metric({
  label,
  value,
  unit,
  quantity = "value",
  qualifier,
  size = "md",
  className,
}: {
  label: ReactNode;
  value: number | string | null | undefined;
  unit?: ReactNode;
  quantity?: Quantity;
  qualifier?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const shown = typeof value === "string" ? value : formatNumber(value, quantity);
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-label text-fg-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={cn("text-fg tabular-nums", size === "lg" ? "text-metric" : size === "md" ? "text-title" : "text-heading")}>
          {shown}
        </span>
        {unit && value != null ? <span className="text-body text-fg-muted">{unit}</span> : null}
      </div>
      {qualifier ? <div className="mt-0.5 text-caption text-fg-muted">{qualifier}</div> : null}
    </div>
  );
}
