import { cvLogoNote, cvTopKNote, groupMeanBaselineVerdict, type PopulatedResult } from "@/lib/api";

/**
 * Three evaluation-hygiene checks the pooled grouped-CV Spearman above can
 * miss on its own: generalization to a genuinely unseen group (`cv_logo`),
 * the client's actual top-k decision rather than the whole ranking
 * (`cv_topk`), and how much of the apparent signal is just the model
 * recognizing which recipe a row belongs to (`cv_group_mean_baseline`).
 *
 * Each renders the engine's own stated reason when it could not be computed
 * on this sheet, never silence. When the model does not clearly beat the
 * group-mean baseline - the honest moment that field exists to catch - its
 * line is promoted out of the quiet card grid into a loud callout above it.
 *
 * Renders nothing when the engine reported none of the three (older engine
 * builds).
 */
export function EvaluationChecks({ d }: { d: PopulatedResult }) {
  const logo = cvLogoNote(d.cv_logo);
  const topk = cvTopKNote(d.cv_topk);
  const baseline = groupMeanBaselineVerdict(d.cv_spearman, d.cv_group_mean_baseline);
  if (!logo && !topk && !baseline) return null;

  const cards: { title: string; text: string }[] = [];
  if (logo) cards.push({ title: "Leave-one-group-out", text: logo });
  if (topk) cards.push({ title: "Top-k overlap", text: topk });
  if (baseline && !baseline.prominent) cards.push({ title: "Group-mean baseline", text: baseline.text });

  return (
    <div className="mt-4">
      {baseline?.prominent ? (
        <div className="mb-3 rounded-2xl border-l-4 border-amber/30 border-l-amber bg-amber-soft p-3 text-[12.5px] leading-relaxed text-amber">
          {baseline.text}
        </div>
      ) : null}
      {cards.length ? (
        <>
          <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Evaluation checks</div>
          <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
            {cards.map((c) => (
              <div key={c.title} className="flex flex-col rounded-[10px] border border-border bg-card p-3">
                <span className="text-[12px] font-medium text-fg">{c.title}</span>
                <p className="mt-1 text-[12px] leading-snug text-muted">{c.text}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
