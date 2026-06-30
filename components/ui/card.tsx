import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-card p-5 shadow-[0_1px_2px_rgba(20,40,30,.04),0_10px_26px_rgba(20,40,30,.05)]",
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
        hero ? "bg-accent-hover shadow-[0_8px_20px_rgba(14,124,87,.30)]" : "bg-bg",
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

export function Tag({ mode }: { mode: "explore" | "exploit" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
        mode === "exploit" ? "bg-accent-soft text-accent-hover" : "bg-explore-soft text-explore-deep",
      )}
    >
      {mode}
    </span>
  );
}
