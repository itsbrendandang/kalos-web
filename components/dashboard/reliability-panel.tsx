import { PredScatter } from "@/components/charts";
import type { PopulatedResult } from "@/lib/api";
import { cn, num } from "@/lib/utils";

/** Known engine "not modeled" labels, mapped to an honest one-line description. */
const UNMODELED_NOTES: Record<string, string> = {
  "feasibility probability": "Whether a recipe produces any measurable output is not predicted as a separate gate.",
  "calibration (ECE)": "Prediction-interval calibration (expected calibration error) is not scored.",
  "scale-up transfer": "Predictions are bench-scale only; transfer to production scale is not modeled.",
};

/**
 * Right-hand "Model reliability" panel: held-out Spearman + CI, the
 * conformal band basis, predicted-vs-measured (reuses PredScatter), a
 * cross-validation detail list, and the engine's own "not modeled yet"
 * callouts. Every value comes from `d` - no fabricated coverage numbers or
 * ideal ranges.
 */
export function ReliabilityPanel({ d }: { d: PopulatedResult }) {
  const rho = d.cv_spearman;
  const ci = d.cv_ci95 ?? null;
  const rel = d.reliability;
  const floorNote =
    rel != null
      ? rel.clears_floor
        ? `Above ${rel.spearman_floor.toFixed(2)} floor`
        : `Below ${rel.spearman_floor.toFixed(2)} floor`
      : null;
  const unmodeled = rel?.unmodeled ?? [];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4">
      <div className="text-[15px] font-semibold text-fg">Model reliability</div>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        How much to trust these predictions, and what the model does not cover.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="flex min-h-[96px] flex-col justify-center rounded-[10px] border border-border p-3">
          <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Held-out Spearman</div>
          <div className="tabular mt-1 font-mono text-[22px] font-semibold text-fg">
            {rho != null ? rho.toFixed(2) : "n/a"}
          </div>
          <div className="tabular mt-0.5 font-mono text-[12px] text-muted">
            {ci ? `95% CI ${ci[0].toFixed(2)} to ${ci[1].toFixed(2)}` : "not scored (too few groups)"}
          </div>
        </div>
        <div className="flex min-h-[96px] flex-col justify-center rounded-[10px] border border-border p-3">
          <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Conformal band</div>
          <div className="tabular mt-1 font-mono text-[22px] font-semibold text-fg">
            {d.conformal_q != null ? `+/- ${num(d.conformal_q, 2)}` : "n/a"}
          </div>
          <div className="mt-0.5 text-[12px] text-muted">distribution-free residual band</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Predicted vs measured</div>
          {floorNote ? (
            <span
              className={cn(
                "rounded-lg border px-2 py-0.5 text-[11px] whitespace-nowrap",
                rel?.clears_floor
                  ? "border-green-soft bg-green-soft text-green"
                  : "border-amber-soft bg-amber-soft text-amber",
              )}
            >
              {floorNote}
            </span>
          ) : null}
        </div>
        <div className="mt-2 rounded-[10px] border border-border bg-bg p-2">
          <PredScatter oof={d.oof} />
          {d.oof.length ? (
            <div className="flex items-center justify-between px-1 pt-1 text-[10px] text-muted">
              <span>measured {d.target}</span>
              <span className="font-mono">out-of-fold - n = {d.oof.length}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Cross-validation</div>
        <div className="mt-2 flex flex-col divide-y divide-border rounded-[10px] border border-border">
          {d.cv_n_groups != null ? (
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[12px] text-muted">Recipe groups</span>
              <span className="tabular font-mono text-[12px] font-semibold text-fg">{d.cv_n_groups}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[12px] text-muted">Points held out</span>
            <span className="tabular font-mono text-[12px] font-semibold text-fg">{d.oof.length}</span>
          </div>
          {d.group_col ? (
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[12px] text-muted">Grouped by</span>
              <span className="tabular font-mono text-[12px] font-semibold text-fg">{d.group_col}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Not modeled yet</div>
        <div className="mt-2 flex flex-1 flex-col gap-2.5">
          {unmodeled.length ? (
            unmodeled.map((item) => (
              <div key={item} className="flex flex-1 flex-col justify-center rounded-[10px] border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-fg capitalize">{item}</span>
                  <span className="rounded-lg border border-border bg-bg px-2 py-0.5 text-[11px] whitespace-nowrap text-explore-deep">
                    not modeled
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-muted">
                  {UNMODELED_NOTES[item] ?? "Not yet modeled by the engine."}
                </p>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-[12px] text-muted">no unmodeled items reported</p>
          )}
        </div>
      </div>
    </div>
  );
}
