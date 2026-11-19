import type { ReactNode } from "react";
import { Ban, CircleDashed } from "lucide-react";

/*
 * Inside-chart states (VIZ_SPEC 3.5). A refusal replaces the plot (no axes, no
 * ghost data): a hatch swatch, the engine's reasons verbatim, then what would
 * fix it. It is neutral, not red: a refusal is an honest result.
 */
export function RefusalBlock({ title = "Kalos refused to predict this", reasons, fix, footer }: { title?: string; reasons: string[]; fix?: string[]; footer?: ReactNode }) {
  return (
    <div role="note" className="flex flex-col gap-3 rounded-lg border border-border bg-subtle p-tight">
      <p className="flex items-center gap-2 text-label text-fg">
        <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
          <defs>
            <pattern id="refusal-swatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke="var(--chart-refused)" strokeWidth="1.5" />
            </pattern>
          </defs>
          <rect width="16" height="16" rx="3" fill="url(#refusal-swatch)" stroke="var(--chart-refused)" />
        </svg>
        <Ban className="sr-only" aria-hidden />
        {title}
      </p>
      {reasons.length ? (
        <ul className="list-disc pl-5 text-body text-fg">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {fix && fix.length ? (
        <div>
          <p className="text-label text-fg">What would fix it</p>
          <ul className="mt-1 list-disc pl-5 text-body text-fg-muted">
            {fix.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {footer ? <div className="text-caption text-fg-muted">{footer}</div> : null}
    </div>
  );
}

/** Data exists but is too thin: the threshold and the current count, in one sentence. */
export function InsufficientBlock({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex min-h-32 flex-1 items-center justify-center rounded-lg bg-subtle px-6 py-8 text-center text-body text-fg-muted">
      {children}
    </div>
  );
}

/** The engine declined to compute this, with its reason verbatim. */
export function NotScoredBlock({ reason }: { reason: string }) {
  return (
    <div role="note" className="flex min-h-24 flex-1 items-center justify-center gap-2 rounded-lg bg-subtle px-6 py-6 text-center text-body text-fg-muted">
      <CircleDashed className="size-4 shrink-0" aria-hidden />
      <span>
        Not scored: <span className="text-fg">{reason}</span>
      </span>
    </div>
  );
}
