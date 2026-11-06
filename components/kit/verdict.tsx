import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Disclosure } from "@/components/kit/disclosure";
import { TONE_ICON, TONE_TEXT, type Tone } from "@/components/kit/tone";
import { WHY_PREFIX } from "@/lib/why";

/**
 * A plain-language verdict: one sentence first, its tone as an icon, then
 * the "Why this matters" line (lib/why.ts) on the surface, the reasoning and
 * raw numbers one click down. No box: the sentence is the headline. Use it
 * for "is this reliable", "did the round help" and similar.
 */
export function Verdict({
  tone = "neutral",
  children,
  why,
  detail,
  detailLabel = "Why",
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  /** The why-line for this verdict's code, from whyLine(); shown directly under the sentence. */
  why?: string | null;
  detail?: ReactNode;
  detailLabel?: ReactNode;
  className?: string;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <p className="flex items-start gap-2.5 text-heading text-fg">
        <Icon className={cn("mt-1 size-[18px] shrink-0", TONE_TEXT[tone])} aria-hidden />
        <span className="min-w-0">{children}</span>
      </p>
      {why ? (
        <p className="ml-7 text-body text-fg-muted">
          {WHY_PREFIX} {why}
        </p>
      ) : null}
      {detail ? (
        <Disclosure summary={detailLabel} className="ml-7 border-t-0">
          <div className="text-body text-fg-muted">{detail}</div>
        </Disclosure>
      ) : null}
    </div>
  );
}
