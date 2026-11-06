import { cn } from "@/lib/utils";
import { WHY_PREFIX, whyLine } from "@/lib/why";

/**
 * "Why this matters:" plus the one line for a code from lib/why.ts, as muted
 * body text. Renders nothing for a code that has no words, so the raw code
 * never leaks onto the surface. Sits directly under a verdict or a warning,
 * or inside the "Why" disclosure of a lower-priority finding.
 */
export function WhyLine({ code, className }: { code: string; className?: string }) {
  const line = whyLine(code);
  if (!line) return null;
  return (
    <p className={cn("text-body text-fg-muted", className)}>
      {WHY_PREFIX} {line}
    </p>
  );
}
