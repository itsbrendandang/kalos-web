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
 * The shadcn slot API (CardHeader/CardTitle/CardDescription/CardAction/
 * CardContent/CardFooter) is added alongside it, retuned to nest INSIDE
 * `Card`'s padding rather than supply its own. New surfaces get the titled-card
 * idiom and registry blocks keep resolving their imports, with no change to
 * any existing call site.
 *
 * base-nova's CardTitle shipped a `cn-font-heading` class that this registry
 * never defines - a silent no-op. It is replaced with `font-head` (the kalos
 * Satoshi heading utility from app/globals.css), which is what it was for.
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

/** Title row. Grows a second column automatically when a CardAction is present. */
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "mb-3 grid auto-rows-min items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-head text-[15px] leading-snug font-semibold text-fg", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[12px] leading-5 text-muted", className)}
      {...props}
    />
  );
}

export function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}

/** Flat footer: a hairline rule, no fill, no inset - elevation is not used. */
export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("mt-4 flex items-center border-t border-border pt-4", className)}
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
        hero ? "bg-accent-hover" : "bg-blue-soft",
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
            "grid size-8 shrink-0 place-items-center rounded-lg",
            tone === "accent" ? "bg-accent-soft text-accent-text" : "bg-explore-soft text-explore-deep",
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
