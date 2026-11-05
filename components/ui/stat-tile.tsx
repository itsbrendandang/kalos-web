import type { ComponentType, ReactNode } from "react";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Dense KPI tile, 76px tall, for a row of counts that should read at a glance
 * (QC totals, plate controls). Same card surface as Card, a title-size
 * tabular number, and an optional `tooltip` that spells out the definition.
 * For a headline number with a delta, use KpiCard (components/kit/kpi-card.tsx).
 */
export function StatTile({
  label,
  value,
  hint,
  tooltip,
  icon: Icon,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tooltip?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: "neutral" | "accent";
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "flex h-19 items-center gap-3 rounded-xl px-4 py-2",
        tone === "accent" && "bg-accent-soft",
        className,
      )}
    >
      {Icon ? (
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg bg-subtle", tone === "accent" ? "text-accent" : "text-fg-muted")}>
          <Icon className="size-4" aria-hidden />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-caption text-fg-muted">
          <span className="truncate">{label}</span>
          {tooltip ? (
            <Tooltip>
              <TooltipTrigger
                className="inline-flex shrink-0 rounded-full text-fg-muted transition-colors hover:text-fg"
                aria-label={typeof label === "string" ? `${label} definition` : "Definition"}
              >
                <Info className="size-3.5" aria-hidden />
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="truncate text-title tabular-nums text-fg">{value}</div>
        {hint ? <div className="truncate text-caption text-fg-muted">{hint}</div> : null}
      </div>
    </Card>
  );
}
