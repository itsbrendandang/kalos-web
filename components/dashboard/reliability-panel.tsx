import { Info } from "lucide-react";
import { PredScatter } from "@/components/charts";
import { calibrationNote, coveragePct, repeatSpreadNote, type PopulatedResult } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, num, parseUnit } from "@/lib/utils";

/** Known engine "not modeled" labels, mapped to an honest one-line description. */
const UNMODELED_NOTES: Record<string, string> = {
  "feasibility probability": "Whether a recipe produces any measurable output is not predicted as a separate gate.",
  "calibration (ECE)": "Prediction-interval calibration (expected calibration error) is not scored.",
  "scale-up transfer": "Predictions are bench-scale only; transfer to production scale is not modeled.",
};

/** A stat-tile label with a small info-tooltip beside it, spelling out the definition
 *  without removing the fuller description already printed below the number. */
function LabelWithTooltip({ label, definition }: { label: string; definition: string }) {
  return (
    <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger
          className="inline-flex shrink-0 rounded-full text-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={`${label} definition`}
        >
          <Info className="size-3" aria-hidden />
        </TooltipTrigger>
        <TooltipContent>{definition}</TooltipContent>
      </Tooltip>
    </div>
  );
}

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
  const unit = parseUnit(d.target);
  const coverage = coveragePct(d.conformal_coverage);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4">
      <div className="text-[15px] font-semibold text-fg">Model reliability</div>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        How much to trust these predictions, and what the model does not cover.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="flex min-h-[96px] flex-col justify-center rounded-[10px] border border-border p-3">
          <LabelWithTooltip
            label="Held-out Spearman"
            definition="Rank agreement between predicted and measured order on runs the model never trained on. 0 = no better than chance, 1 = perfect."
          />
          <div className="tabular mt-1 font-mono text-[22px] font-semibold text-fg">
            {rho != null ? rho.toFixed(2) : "n/a"}
          </div>
          <div className="tabular mt-0.5 font-mono text-[12px] text-muted">
            {ci ? `95% CI ${ci[0].toFixed(2)} to ${ci[1].toFixed(2)}` : "not scored (too few groups)"}
          </div>
          {repeatSpreadNote(d.cv_n_repeats, d.cv_spearman_per_repeat) ? (
            <div className="tabular mt-0.5 font-mono text-[10.5px] text-muted opacity-80">
              {repeatSpreadNote(d.cv_n_repeats, d.cv_spearman_per_repeat)}
            </div>
          ) : null}
          <div className="mt-1 text-[11px] leading-snug text-muted">
            Rank agreement: how well predicted order matches measured order (0 = no better than chance, 1 = perfect).
          </div>
        </div>
        <div className="flex min-h-[96px] flex-col justify-center rounded-[10px] border border-border p-3">
          <LabelWithTooltip
            label="Conformal band"
            definition={
              coverage
                ? `A distribution-free ± band from pooled out-of-fold residuals: the interval within which a new prediction should fall ${coverage} of the time.`
                : "A distribution-free ± band from pooled out-of-fold residuals, sized so a new prediction should typically fall within it."
            }
          />
          <div className="tabular mt-1 font-mono text-[22px] font-semibold text-fg">
            {d.conformal_q != null ? `± ${num(d.conformal_q, 2)}` : "n/a"}
          </div>
          <div className="mt-0.5 text-[12px] text-muted">distribution-free residual band</div>
          {d.conformal_q != null
            ? (() => {
                const targetName = d.target.replace(/\s*\([^)]*\)\s*$/, "");
                const gloss = `A single prediction can be off by ±${num(d.conformal_q, 2)}${
                  unit ? ` ${unit}` : ""
                }${coverage ? ` (${coverage})` : ""}. Compare to your ${targetName} range to judge if that's usable.`;
                return <div className="mt-1 text-[11px] leading-snug text-muted">{gloss}</div>;
              })()
            : null}
        </div>
      </div>

      {rel && [rel.producer_spearman, rel.producer_clears_floor, rel.n_producers, rel.producer_threshold].some((v) => v !== undefined) ? (
        <div className="mt-2 rounded-[10px] border border-border p-3 text-[12px] text-muted">
          <div className="font-semibold text-fg">Producer-only ranking</div>
          <p className="mt-1">
            {rel.producer_spearman === undefined ? "Producer rank agreement not reported." : rel.producer_spearman == null
              ? "Producer rank agreement not measured; the engine gave no reason."
              : `Spearman ${num(rel.producer_spearman, 2)} · ${rel.producer_clears_floor === undefined ? "floor verdict not reported" : rel.producer_clears_floor ? "clears floor" : "does not clear floor"}`}
          </p>
          <p>{rel.n_producers ?? "n/a"} producers · threshold {rel.producer_threshold == null ? "not reported" : num(rel.producer_threshold, 2)}</p>
          <p className="mt-1">Supplementary diagnostic; the reliability verdict uses the full held-out evaluation.</p>
        </div>
      ) : null}

      {d.reliability?.calibration ? (
        <div className="mt-2 rounded-[10px] border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <LabelWithTooltip
              label="Interval calibration"
              definition="Held-out coverage of the model's own uncertainty bands - does the stated +/- match how often the truth actually falls inside it. Independent of ranking accuracy."
            />
            {d.reliability.calibration.available && d.reliability.calibration.levels.length ? (
              <Tooltip>
                <TooltipTrigger className="text-[10px] text-muted underline decoration-dotted focus-visible:outline-none">
                  by level
                </TooltipTrigger>
                <TooltipContent>
                  {d.reliability.calibration.levels.map((lv) => (
                    <div key={lv.nominal}>
                      {Math.round(lv.nominal * 100)}% nominal -&gt; {Math.round(lv.empirical * 100)}% empirical
                    </div>
                  ))}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <div className="mt-1 text-[12px] leading-snug text-muted">{calibrationNote(d.reliability.calibration)}</div>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Predicted vs measured</div>
          {floorNote ? (
            <Badge
              variant="outline"
              className={cn(
                "whitespace-nowrap",
                rel?.clears_floor ? "border-green-soft bg-green-soft text-green" : "border-amber-soft bg-amber-soft text-amber",
              )}
            >
              {floorNote}
            </Badge>
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
    </div>
  );
}

/**
 * Full-width "Model coverage" footer for the Model-quality section: how the
 * held-out evaluation was done (cross-validation) and what the engine does not
 * model yet. Split out of `ReliabilityPanel` so the narrow right rail carries
 * only the trust story (Spearman, conformal band, predicted-vs-measured) and
 * these wider caveat blocks get horizontal room instead of stacking tall in a
 * 360px column. Laid on the SAME `1.85fr / 0.95fr` rhythm as the section above,
 * so the not-modeled cards align under Process drivers and cross-validation
 * aligns under Model reliability.
 */
export function ModelCoverage({ d }: { d: PopulatedResult }) {
  const unmodeled = d.reliability?.unmodeled ?? [];

  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.85fr_0.95fr]">
      <div>
        <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Not modeled yet</div>
        {unmodeled.length ? (
          <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
            {unmodeled.map((item) => (
              <div key={item} className="flex flex-col rounded-[10px] border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-fg capitalize">{item}</span>
                  <Badge variant="outline" className="whitespace-nowrap text-explore-deep">
                    not modeled
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-muted">
                  {UNMODELED_NOTES[item] ?? "Not yet modeled by the engine."}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-[10px] border border-border bg-card py-6 text-center text-[12px] text-muted">
            no unmodeled items reported
          </p>
        )}
      </div>

      <div>
        <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Cross-validation</div>
        <div className="mt-2 flex flex-col divide-y divide-border rounded-[10px] border border-border bg-card">
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
    </div>
  );
}
