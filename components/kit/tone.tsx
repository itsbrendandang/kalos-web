import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";

export type Tone = "neutral" | "accent" | "good" | "warn" | "bad";

/** Each tone has its own icon shape, so tone never rides on colour alone. */
export const TONE_ICON: Record<Tone, LucideIcon> = {
  neutral: Info,
  accent: Info,
  good: CircleCheck,
  warn: TriangleAlert,
  bad: CircleAlert,
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg-muted",
  accent: "text-accent",
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
};
