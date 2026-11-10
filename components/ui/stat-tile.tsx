import type { ComponentType, ReactNode } from "react";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Dense KPI tile - about 76px tall (down from the 96-132px `Kpi`/`StatCard`
 * composites in components/ui/card.tsx), so a KPI row reads at a glance
 * instead of eating a full screen's worth of vertical space. Built on the
 * `Card` slot, tabular figures, and an
 * optional `tooltip` that spells out the statistic's definition instead of
 * relying on the reader already knowing it.
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
        "flex min-h-[76px] items-center gap-3 rounded-xl border border-border bg-surface px-tight py-2",
        tone === "accent" && "bg-accent-soft",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg bg-surface",
            tone === "accent" ? "text-accent-text" : "text-fg-muted",
          )}
        >
          <Icon className="size-3.5" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-label text-fg-muted">
          <span className="truncate">{label}</span>
          {tooltip ? (
            <Tooltip>
              <TooltipTrigger
                className="inline-flex shrink-0 rounded-full text-fg-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={typeof label === "string" ? `${label} definition` : "Definition"}
              >
                <Info className="size-3" aria-hidden />
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="truncate text-title text-fg tabular-nums">
          {value}
        </div>
        {hint ? <div className="truncate text-caption text-fg-muted">{hint}</div> : null}
      </div>
    </Card>
  );
}
