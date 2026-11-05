import type { ReactNode } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import type { DataNote, DiversitySummary } from "@/components/campaign/plan-view";
import type { BatchModel } from "@/components/campaign/plan/use-batch-model";
import { TONE_ICON, TONE_TEXT, type Tone } from "@/components/kit/tone";
import { cn } from "@/lib/utils";

/**
 * What to know before approving, one line each. Warnings are things to look at
 * before running (a proposal at the edge of the data, a short batch); the rest
 * is information. Nothing here is a Callout: the page carries one at most.
 */
export function BeforeStart({ m, notes, diversity }: { m: BatchModel; notes: DataNote[]; diversity: DiversitySummary | null }) {
  const rowCount = m.rows.length;
  return (
    <section aria-labelledby="plan-before-title" className="flex flex-col gap-2">
      <h2 id="plan-before-title" className="text-heading text-fg">
        Before you start
      </h2>
      <ul className="flex flex-col gap-1.5">
        {notes.map((n) => (
          <Note key={n.text} tone={n.tone}>
            {n.text}
          </Note>
        ))}
        {m.grouped.map((g) => (
          <Note key={g.kind} tone="warn">
            <span className="font-medium">{g.ranks.map((r) => `P${r}`).join(", ")}</span>: {g.label}.
          </Note>
        ))}
        {m.grouped.length === 0 && rowCount > 0 ? <Note tone="good">No proposal was flagged by the checks that could run.</Note> : null}
        {diversity ? (
          <Note tone={diversity.short ? "warn" : "neutral"} detail={m.spread.length ? m.spread.join(" ") : undefined}>
            {diversity.headline}
          </Note>
        ) : (
          <Note tone="neutral">The engine did not report how far apart the proposals are.</Note>
        )}
        {m.band == null && rowCount > 0 ? <Note tone="neutral">The engine reported no prediction band, so predicted gains are shown without an interval.</Note> : null}
      </ul>
    </section>
  );
}

export function Note({ tone, children, detail }: { tone: Tone; children: ReactNode; detail?: ReactNode }) {
  const Icon = tone === "good" ? CircleCheck : tone === "warn" ? TriangleAlert : TONE_ICON.neutral;
  return (
    <li className="flex items-start gap-2 text-body text-fg">
      <Icon className={cn("mt-1 size-4 shrink-0", TONE_TEXT[tone])} aria-hidden />
      <span className="min-w-0">
        {children}
        {detail ? <span className="block text-caption text-fg-muted">{detail}</span> : null}
      </span>
    </li>
  );
}
