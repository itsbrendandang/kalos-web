import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact number for display. */
export function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 1) return n.toFixed(1);
  return n.toFixed(digits);
}
