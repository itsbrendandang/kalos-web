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

/** Pulls a trailing unit like "mg/L" out of a target name such as "Lipase conc. (mg/L)". */
export function parseUnit(target: string): string {
  const m = target.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : "";
}
