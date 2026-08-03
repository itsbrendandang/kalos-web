import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal, borderless surface (see the design direction: no shadows, no boxes).
 * A Card is now an open section - it carries padding for rhythm but no border or
 * fill, so content is grouped by whitespace and the occasional hairline divider
 * rather than a bordered box. Pass `bordered` for the rare case that genuinely
 * needs an outline (e.g. an inline callout).
 */
export function Card({
  className,
  bordered = false,
  ...props
}: React.ComponentProps<"div"> & { bordered?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(20,35,28,0.04),0_14px_34px_rgba(20,35,28,0.055)]",
        bordered && "border-blue-border",
        className,
      )}
      {...props}
    />
  );
}

export function SectionLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mb-2 text-[13px] font-semibold text-fg", className)} {...props} />;
}

export function Kpi({
  label,
  value,
  hint,
  hero = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  hero?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-h-[104px] rounded-xl border px-4 py-4",
        hero ? "border-accent-hover bg-accent-hover shadow-[0_10px_26px_rgba(14,118,83,0.2)]" : "border-border bg-blue-soft",
      )}
    >
      <div className={cn("text-[11px] font-medium", hero ? "text-[color:var(--primary-foreground)]" : "text-muted")}>{label}</div>
      <div
        className={cn(
          "tabular mt-1.5 font-mono text-[23px] leading-none font-semibold",
          hero ? "text-[color:var(--primary-foreground)]" : "text-fg",
        )}
      >
        {value}
      </div>
      {hint ? <div className={cn("mt-0.5 text-[11px]", hero ? "text-[color:var(--primary-foreground)]/85" : "text-muted")}>{hint}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "accent",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "accent" | "explore";
}) {
  return (
    <Card className="min-h-[132px] rounded-xl bg-blue-soft p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10.5px] font-semibold text-muted uppercase">{label}</div>
        <span
          className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg border",
            tone === "accent" ? "border-blue-border bg-accent-soft text-accent-text" : "border-explore/20 bg-explore-soft text-explore-deep",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="tabular mt-2.5 font-mono text-[25px] leading-none font-semibold text-fg">{value}</div>
      {sub ? <div className="mt-2 text-[11px] leading-snug text-muted">{sub}</div> : null}
    </Card>
  );
}

export function Tag({ mode }: { mode: "explore" | "exploit" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
        mode === "exploit" ? "bg-accent text-[color:var(--primary-foreground)]" : "bg-explore-soft text-explore-deep ring-1 ring-border",
      )}
    >
      {mode}
    </span>
  );
}
