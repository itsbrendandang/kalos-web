import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card and the kalos section composites.
 *
 * Reconciliation notes (2026-08-08 shadcn migration): `Card` keeps the kalos
 * box model exactly as it was - a borderless, shadowless open section that
 * carries its own padding - because 27 files already compose arbitrary
 * children directly inside it. Adopting base-nova's stock Card (which is
 * `ring-1 ring-foreground/10` with a card-spacing padding variable and expects children
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
 * never defines - a silent no-op. It is replaced with the `text-heading` type role (the kalos
 * Satoshi heading utility from app/globals.css), which is what it was for.
 */
/**
 * The card on the canvas (DESIGN.md "Layout" > Radius / Elevation): a white
 * surface with a hairline border, 16px radius and the card shadow, for
 * top-level blocks that sit directly on the grey page. The only place in the
 * app that spells out the 16px radius and the card shadow (design-guards
 * counts them); reuse it, and never nest one inside another.
 */
export const CANVAS_CARD = "rounded-2xl border border-border bg-surface shadow-card";

const CARD_PADDING = {
  inset: "p-inset", // 24px - an open Card
  panel: "p-panel", // 20px - a bordered surface
  none: "", //        caller supplies its own
} as const;

export function Card({
  className,
  bordered = false,
  padding = "inset",
  ...props
}: React.ComponentProps<"div"> & { bordered?: boolean; padding?: keyof typeof CARD_PADDING }) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-xl", CARD_PADDING[padding], bordered && CANVAS_CARD, className)}
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
      className={cn("text-heading text-fg", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-caption text-fg-muted", className)}
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
