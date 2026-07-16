import { cn } from "@/lib/utils";
import type { Drift } from "@/lib/mock/pipeline";

const SEVERITY_STYLE: Record<Drift["severity"], string> = {
  ok: "border-border bg-card text-muted",
  warn: "border-amber/30 bg-amber-soft text-amber",
  alert: "border-red/30 bg-red/10 text-red",
};

function formatValue(value: number, unit: string): string {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${n}${unit === "%" ? "%" : ` ${unit}`}` : n;
}

/** One drift chip: "variable value / exp expected", colored by severity.
 *  Never color alone - severity is also in the text, matching the status-chip
 *  convention used on the plate and experiments surfaces. */
export function DriftChip({ drift }: { drift: Drift }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap",
        SEVERITY_STYLE[drift.severity],
      )}
    >
      {drift.variable} {formatValue(drift.value, drift.unit)}
      <span className="font-normal opacity-70">/ exp {formatValue(drift.expected, drift.unit)}</span>
    </span>
  );
}
