import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card: the one surface for grouped content. Flat white, a hairline and the
 * card shadow (the `glass` class in app/globals.css), 8px radius, 24px
 * padding. Every bordered region on the kit (Panel, ChartFrame, NextCard,
 * KpiCard, ErrorState) uses the same treatment, so a card looks the same
 * everywhere.
 *
 * The slot API (CardHeader, CardTitle, CardDescription, CardAction,
 * CardContent, CardFooter) nests inside Card's padding. It is kept because
 * shadcn registry blocks import it; no page needs to use it directly.
 */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("glass rounded-2xl p-6", className)} {...props} />;
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
  return <div data-slot="card-title" className={cn("text-heading text-fg", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-body text-fg-muted", className)} {...props} />;
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

/** Flat footer: a hairline rule, no fill, no inset. */
export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("mt-4 flex items-center border-t border-border pt-4", className)}
      {...props}
    />
  );
}

/** A small heading for a group of controls or rows inside a card. */
export function SectionLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mb-2 text-label text-fg", className)} {...props} />;
}

/**
 * A headline number inside a card. Use `hero` for the one number the page is
 * about (accent fill). Numbers use the title role and tabular figures.
 */
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
    <Card className={cn("flex min-h-24 flex-col gap-1 p-4", hero && "border-transparent bg-accent text-accent-fg")}>
      <div className={cn("text-label", hero ? "text-accent-fg" : "text-fg-muted")}>{label}</div>
      <div className={cn("text-metric tabular-nums", hero ? "text-accent-fg" : "text-fg")}>{value}</div>
      {hint ? <div className={cn("text-caption", hero ? "text-accent-fg" : "text-fg-muted")}>{hint}</div> : null}
    </Card>
  );
}
