import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_ICON, TONE_TEXT, type Tone } from "@/components/kit/tone";

const SURFACE: Record<Tone, string> = {
  neutral: "border border-border bg-surface",
  accent: "bg-accent-soft",
  good: "bg-good-soft",
  warn: "bg-warn-soft",
  bad: "bg-bad-soft",
};

/**
 * The one callout a screen may carry. Warn and bad are only for things the
 * user must act on; information is `neutral` (or a plain sentence, not a
 * callout at all). Tone shows as a small icon on a tinted or neutral surface,
 * never as a coloured side stripe. Merge caveats into one; put the rest in a
 * Disclosure.
 */
export function Callout({
  tone = "neutral",
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl px-4 py-3.5", SURFACE[tone], className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_TEXT[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label text-fg">{title}</p>
        {children ? <div className="mt-1 text-body text-fg">{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
