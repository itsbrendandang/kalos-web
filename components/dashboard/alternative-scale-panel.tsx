import { alternativeScaleNote, calibrationNote, type PopulatedResult } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

/**
 * The engine's explicit, labeled log-scale evaluation pass
 * (`alternative_scale`) - run only when the raw-scale diagnostic
 * (`noise.scale.suggests_transform`) says the raw ICC understates real
 * recipe-to-recipe signal because of variance-mean coupling, not just
 * uniform assay noise. A second GP is fit and cross-validated on
 * `log(y + offset)`, openly, instead of the engine silently switching the
 * scale it models on.
 *
 * Evaluation-only: this NEVER changes what the rest of the page reports -
 * proposals and every other number stay on the raw scale, which is why the
 * engine's own `interpretation` line is always shown alongside the numbers
 * rather than left implicit.
 *
 * `scale: null` (transform not suggested on this sheet) renders the engine's
 * `reason` as a single quiet line, matching the null-with-reason convention
 * `EvaluationChecks` already uses for `cv_logo`/`cv_topk` - no card, no
 * "evaluation-only" badge, nothing that implies a check ran. Renders nothing
 * at all when `alternative_scale` is absent (older engine build).
 *
 * The calibration sub-card is deliberately its own bordered block, labeled
 * "log units", because `ece`/`z_std` here are computed on log-scale
 * residuals - comparable to the raw `reliability.calibration` card in
 * STRUCTURE (is coverage honest at each nominal level) but not in absolute
 * magnitude. It must never be laid out as if it were one more number in the
 * same units as that card.
 */
export function AlternativeScalePanel({ d }: { d: PopulatedResult }) {
  const alt = d.alternative_scale;
  const note = alternativeScaleNote(alt);
  if (!note) return null;

  if (!alt || alt.scale == null) {
    return <p className="mt-2 text-[11px] leading-snug text-muted opacity-70">{note}</p>;
  }

  const calNote = calibrationNote(alt.calibration);

  return (
    <div className="mt-4 rounded-[10px] border border-blue-border bg-blue-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Alternative scale check (log)</div>
        <Badge variant="outline" className="border-blue-border bg-blue-tint whitespace-nowrap text-accent-text">
          evaluation-only
        </Badge>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-fg">{note}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted">{alt.interpretation}</p>
      {calNote ? (
        <div className="mt-2 rounded-[10px] border border-border bg-card p-2.5">
          <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">
            Log-scale calibration - log units, not comparable to the raw calibration above
          </div>
          <p className="mt-1 text-[12px] leading-snug text-muted">{calNote}</p>
        </div>
      ) : null}
    </div>
  );
}
