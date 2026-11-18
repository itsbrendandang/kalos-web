import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card and the kalos section composites.
 *
 * Reconciliation notes (2026-08-08 shadcn migration): `Card` keeps the kalos
 * box model exactly as it was - a borderless, shadowless open section that
 * carries its own padding - because 27 files already compose arbitrary
 * children directly inside it. Adopting base-nova's stock Card (which is
 * `ring-1 ring-foreground/10` with `py-(--card-spacing)` and expects children
 * to be slot components that supply their own horizontal padding) would have
 * silently un-padded every one of those 27 surfaces and reintroduced an
 * elevation ring the design system forbids.
 *
 */
export function Card({
  className,
  bordered = false,
  ...props
}: React.ComponentProps<"div"> & { bordered?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-xl p-6", bordered && "border border-border", className)}
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
        "min-h-[96px] rounded-xl px-4 py-3.5",
        hero ? "bg-accent-hover" : "border border-border bg-card",
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
