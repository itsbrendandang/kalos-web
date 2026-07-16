import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5",
        className,
      )}
      {...props}
    />
  );
}

export function SectionLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mb-2 text-[12px] font-semibold text-fg", className)} {...props} />;
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
        "min-h-[96px] rounded-xl border px-4 py-3.5",
        hero
          ? "border-accent-hover bg-accent-hover"
          : "border-border bg-blue-soft",
      )}
    >
      <div className={cn("text-[11px] font-medium", hero ? "text-white" : "text-muted")}>{label}</div>
      <div
        className={cn(
          "tabular mt-1.5 font-mono text-[23px] leading-none font-semibold",
          hero ? "text-white" : "text-fg",
        )}
      >
        {value}
      </div>
      {hint ? <div className={cn("mt-0.5 text-[11px]", hero ? "text-white/85" : "text-muted")}>{hint}</div> : null}
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
    <Card className="min-h-[132px] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10.5px] font-semibold text-muted uppercase">{label}</div>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg border",
            tone === "accent" ? "bg-accent-soft text-accent-text" : "bg-explore-soft text-explore-deep",
            tone === "accent" ? "border-blue-border" : "border-border",
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
        mode === "exploit" ? "bg-accent text-white" : "bg-explore-soft text-explore-deep ring-1 ring-border",
      )}
    >
      {mode}
    </span>
  );
}
