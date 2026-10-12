import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Without this, tailwind-merge reads the role type utilities (text-body,
// text-label, ...) as text COLORS, so cn("text-body text-fg") silently drops
// the size. The names mirror the type scale and shadow in app/globals.css.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "title", "heading", "body", "label", "caption", "metric", "code"],
      shadow: ["popover"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact number for display: fewer decimals as magnitude grows. */
export function fmt(n: number, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 1) return n.toFixed(1);
  // A value that rounds to zero prints unsigned: "-0.00" reads as a real negative.
  return n.toFixed(digits).replace(/^-(?=0\.?0*$)/, "");
}

/** Exact fixed-decimal number for display, where `fmt`'s compact rounding would
 *  drop meaningful precision (conformal bands, recipe values, predictions). */
export function num(n: number, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  // A value that rounds to zero prints unsigned: "-0.00" reads as a real negative.
  return n.toFixed(digits).replace(/^-(?=0\.?0*$)/, "");
}

/** Pulls a trailing unit like "mg/L" out of a target name such as "Lipase conc. (mg/L)". */
export function parseUnit(target: string): string {
  const m = target.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : "";
}
