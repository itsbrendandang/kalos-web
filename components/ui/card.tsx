import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(17,17,17,.03),0_8px_24px_rgba(17,17,17,.04)]",
        className,
      )}
      {...props}
    />
  );
}

export function SectionLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mb-2 text-[12.5px] font-semibold text-fg", className)} {...props} />;
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
        "rounded-xl px-4 py-3.5",
        hero ? "bg-accent-hover shadow-[0_8px_20px_rgba(32,74,244,.22)]" : "bg-bg",
      )}
    >
      <div className={cn("text-[11px] font-medium", hero ? "text-white" : "text-muted")}>{label}</div>
      <div
        className={cn(
          "tabular mt-1.5 font-mono text-[22px] font-semibold",
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
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10.5px] font-semibold tracking-wide text-muted uppercase">{label}</div>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            tone === "accent" ? "bg-accent-soft text-accent-hover" : "bg-explore-soft text-explore-deep",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="tabular mt-2.5 font-mono text-[26px] leading-none font-semibold text-fg">{value}</div>
      {sub ? <div className="mt-1.5 text-[11px] text-muted">{sub}</div> : null}
    </Card>
  );
}

export function Tag({ mode }: { mode: "explore" | "exploit" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
        mode === "exploit" ? "bg-accent text-white" : "bg-explore-soft text-explore-deep",
      )}
    >
      {mode}
    </span>
  );
}
