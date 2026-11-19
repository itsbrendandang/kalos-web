import type { ReactNode } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { TONE_ICON, TONE_TEXT, type Tone } from "@/components/kit/tone";
import { dataNotes, diversitySummary, groupFlags, type ObservedRange, type RecipeFlag } from "@/components/campaign/plan-view";
import { constraintNote, type DesignBoxExclusion } from "@/lib/api";
import { formatSetting, formatValue } from "@/lib/num";
import { cn } from "@/lib/utils";
import type { PredictAnalysis } from "@/components/predict/predict-view";

/**
 * "Before you start": what the engine said about how this batch was made
 * (diversity, feasibility gating, constraint, in-flight runs it knew about,
 * a narrowed search box) and the per-recipe checks, grouped. Plain sentences
 * with a status icon, not tinted boxes: they inform; the approval dialog is
 * where the user acts.
 */
export function BatchNotes({
  d,
  flags,
  ranges,
  checkedInputs,
  uncheckedInputs,
  hasRows,
}: {
  d: PredictAnalysis;
  flags: { rank: number; flags: RecipeFlag[] }[];
  ranges: Record<string, ObservedRange>;
  checkedInputs: string[];
  uncheckedInputs: string[];
  hasRows: boolean;
}) {
  const grouped = groupFlags(flags);
  const diversity = diversitySummary(d.batch_diversity, d.proposal_notice);
  const constraint = constraintNote(d.constraint);
  const boxNote = boxExclusionsNote(d.design_box_exclusions, ranges);
  const gating = d.proposal_gating;
  const pending = d.n_pending_considered;
  const data = dataNotes(d);
  const band = d.conformal_q ?? null;

  return (
    <div className="flex flex-col gap-5">
      {data.length ? (
        <section aria-labelledby="predict-data-title" className="flex flex-col gap-2">
          <h3 id="predict-data-title" className="text-label text-fg">
            What changed in the data
          </h3>
          <ul className="flex flex-col gap-1.5">
            {data.map((n) => (
              <Note key={n.text} tone={n.tone}>
                {n.text}
              </Note>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="predict-notes-title" className="flex flex-col gap-2">
        <h3 id="predict-notes-title" className="text-label text-fg">
          Before you start
        </h3>
        <ul className="flex flex-col gap-1.5">
          {grouped.map((g) => (
            <Note key={g.kind} tone="warn">
              <span className="font-medium">{g.ranks.map((r) => `P${r}`).join(", ")}</span>: {g.label}.
            </Note>
          ))}
          {grouped.length === 0 && hasRows ? <Note tone="good">No proposal was flagged by the checks that could run.</Note> : null}
          {diversity ? (
            <Note tone={diversity.short ? "warn" : "neutral"} detail={diversity.notes.join(" ")}>
              {diversity.headline}
            </Note>
          ) : (
            <Note tone="neutral">The engine did not report how distinct this batch is.</Note>
          )}
          {gating ? (
            <Note tone="neutral" detail={`Engine reason: ${gating.reason}`}>
              {gating.gated
                ? `Proposals were limited to recipes the feasibility classifier expects to produce${gating.feasibility_auc != null ? ` (classifier AUC ${formatValue(gating.feasibility_auc, { quantity: "score" }).text})` : ""}.`
                : "Proposals were not filtered by predicted feasibility."}
            </Note>
          ) : null}
          {pending != null ? (
            <Note tone="neutral" detail={d.proposal_optimizer ? `Optimizer: ${d.proposal_optimizer}.` : undefined}>
              {pending === 0
                ? "The batch was computed as if nothing were in flight."
                : `The batch was computed knowing about ${formatValue(pending, { quantity: "count" }).text} in-flight ${pending === 1 ? "recipe" : "recipes"}.`}
            </Note>
          ) : null}
          {checkedInputs.length ? (
            <Note
              tone="neutral"
              detail={uncheckedInputs.length ? `The engine returns no range for ${uncheckedInputs.join(", ")}, so ${uncheckedInputs.length === 1 ? "it is" : "they are"} not checked.` : undefined}
            >
              {edgeSources(checkedInputs, ranges)}
            </Note>
          ) : uncheckedInputs.length ? (
            <Note tone="neutral">The engine returned no ranges for {uncheckedInputs.join(", ")}, so no edge-of-range checks were run.</Note>
          ) : null}
          {band == null && hasRows ? <Note tone="neutral">The engine reported no prediction band, so predicted gains are shown without an interval and not checked against one.</Note> : null}
          {constraint ? <Note tone="neutral">{constraint}</Note> : null}
          {boxNote ? <Note tone="neutral">{boxNote}</Note> : null}
        </ul>
      </section>
    </div>
  );
}

export function Note({ tone, children, detail }: { tone: Tone; children: ReactNode; detail?: ReactNode }) {
  const Icon = tone === "warn" ? TriangleAlert : tone === "bad" ? CircleAlert : TONE_ICON[tone];
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

/** Which range each checked input is compared with: the engine's `feature_ranges`, or the values tried in the measured runs. */
function edgeSources(inputs: string[], ranges: Record<string, ObservedRange>): string {
  const engine = inputs.filter((k) => ranges[k]?.source === "engine");
  const observed = inputs.filter((k) => ranges[k]?.source === "observed");
  const parts = [
    engine.length ? `the engine's range for ${engine.join(" and ")}` : null,
    observed.length ? `the values tried in the measured runs for ${observed.join(" and ")}` : null,
  ].filter(Boolean);
  return `Edge-of-range checks use ${parts.join(", and ")}.`;
}

/**
 * The narrowed search box (`design_box_exclusions`), each bound at the
 * precision of the input's range (VIZ_SPEC 2.4). Null when nothing was excluded.
 */
export function boxExclusionsNote(exclusions: DesignBoxExclusion[] | null | undefined, ranges: Record<string, ObservedRange>): string | null {
  if (!exclusions || exclusions.length === 0) return null;
  const parts = exclusions.map((e) => {
    const r = ranges[e.column];
    const range: [number, number] | null = r ? [r.min, r.max] : [e.lower, e.upper];
    const n = formatValue(e.n_excluded, { quantity: "count" }).text;
    return `${e.column} (${formatSetting(e.lower, range).text} to ${formatSetting(e.upper, range).text}, ${n} ${e.n_excluded === 1 ? "row" : "rows"} excluded)`;
  });
  return `Search box narrowed for ${exclusions.length === 1 ? "1 input" : `${formatValue(exclusions.length, { quantity: "count" }).text} inputs`}: ${parts.join("; ")}. The setpoint chart hatches the excluded part.`;
}
