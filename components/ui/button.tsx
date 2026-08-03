import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "accent" | "outline" | "ghost";
type Size = "default" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:cursor-wait disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  accent:
    "border border-accent bg-accent text-[color:var(--primary-foreground)] shadow-[0_5px_14px_rgba(21,154,110,0.2)] hover:border-accent-hover hover:bg-accent-hover",
  outline: "border border-border bg-card text-fg hover:border-blue-border hover:bg-blue-soft",
  ghost: "text-fg hover:bg-blue-soft",
};
const sizes: Record<Size, string> = {
  default: "h-11 px-4 text-[13px]",
  sm: "h-9 px-3 text-xs",
};

/** Composes the same class recipe <Button> renders with, for the rare spots
 *  that need the identical look on an element <Button> can't be - namely a
 *  Next.js <Link> (client-side routing needs a real anchor). Keeps the accent
 *  CTA classes defined once instead of duplicated as ad hoc string literals
 *  (REDESIGN 4.4). */
export function buttonVariants({
  variant = "accent",
  size = "default",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(BASE, variants[variant], sizes[size], className);
}

export function Button({
  className,
  variant = "accent",
  size = "default",
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonVariants({ variant, size, className })} {...props} />;
}
