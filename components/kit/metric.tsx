import type { ReactNode } from "react";
import { formatValue, type Basis, type FormatOptions, type Quantity } from "@/lib/num";
import { cn } from "@/lib/utils";

/**
 * An inline number with its label, unit and qualifier. Numbers go through
 * lib/num (precision from the uncertainty when given, 3 significant figures
 * otherwise, a designed n/a for a missing value); strings pass through as
 * the engine printed them. Measured values are semibold, predicted regular,
 * derived medium (VIZ_SPEC 2.8). The largest size is text-title: only a
 * measured hero number may be bigger, and that is <Num size="metric">.
 */
export function Metric({
  label,
  value,
  unit,
  quantity = "target",
  basis = "derived",
  options,
  qualifier,
  size = "md",
  className,
}: {
  label: ReactNode;
  value: number | string | null | undefined;
  unit?: string | null;
  quantity?: Quantity;
  basis?: Basis;
  options?: FormatOptions;
  qualifier?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  const f = typeof value === "string" ? null : formatValue(value, { ...options, quantity, basis, unit: null });
  const shown = typeof value === "string" ? value : f!.value;
  const missing = value == null || f?.state === "na";
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-label text-fg-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={cn(
            "tabular-nums",
            missing ? "text-fg-muted" : "text-fg",
            size === "md" ? "text-title" : "text-heading",
            basis === "measured" ? "font-semibold" : basis === "predicted" ? "font-normal" : "font-medium",
          )}
        >
          {shown}
        </span>
        {unit && !missing ? <span className="text-body text-fg-muted">{unit}</span> : null}
      </div>
      {qualifier ? <div className="mt-0.5 text-caption text-fg-muted">{qualifier}</div> : null}
    </div>
  );
}
