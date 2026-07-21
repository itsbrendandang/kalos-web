/**
 * Scale-up projection - the "PROJECTED" honesty tier described in
 * docs/DECIDE_COCKPIT.md ("Projection module"). Pure, deterministic, typed
 * functions with NO Math.random and no I/O: every number returned here is a
 * reproducible function of the input recipe/objectives and the documented
 * priors below, so a tooltip can always cite exactly which prior produced a
 * given value.
 *
 * Input gap (documented per the spec): the campaign API has no
 * `best_recipe` field, only a `best` scalar (see `Campaign` in lib/api.ts).
 * Callers must derive `bestRecipe` from the current best proposal's
 * `recipe`/`vals` (the top proposal on /decide, or a campaign's logged best
 * recipe) and `bestObjectives.yield` from the real measured `best`. `purity`
 * is frequently unmeasured at this stage - when absent it is itself
 * projected from `BASELINE_PURITY_PRIOR`, which keeps it honestly in the
 * PROJECTED tier rather than presented as measured.
 *
 * This module never fits a scale-dependent model to the recipe itself - it
 * has no data to do so. It applies fixed, literature-typical retention/cost/
 * time priors per scale transition, exactly as the spec requires ("paths
 * differ ONLY by which prior weight table they apply, never by sampling").
 */

export type ScaleStage = "plate_96w" | "shake_flask" | "benchtop_bioreactor" | "pilot" | "production";

/** Ordered, left-to-right scale-up stages with their approximate working volume. */
export const SCALE_STAGES: readonly {
  stage: ScaleStage;
  label: string;
  volumeLabel: string;
  /** Approximate working volume in liters - the low end of the cited range for multi-scale stages. */
  volumeL: number;
}[] = [
  { stage: "plate_96w", label: "96-well plate", volumeLabel: "~0.2 mL", volumeL: 0.0002 },
  { stage: "shake_flask", label: "Shake flask", volumeLabel: "~50 mL", volumeL: 0.05 },
  { stage: "benchtop_bioreactor", label: "Benchtop bioreactor", volumeLabel: "~250 mL (ambr250-class)", volumeL: 0.25 },
  { stage: "pilot", label: "Pilot", volumeLabel: "~5-50 L", volumeL: 15 },
  { stage: "production", label: "Production", volumeLabel: "~200-2,000 L", volumeL: 1000 },
] as const;

export type ScaleUpPathId = "max_yield" | "min_cost" | "fastest";

/**
 * Per-stage prior: the multiplicative/additive adjustment applied when
 * moving INTO this stage from the previous one. `plate_96w` is always the
 * identity baseline (retention 1, cost multiplier 1, no added band) because
 * it is the measured starting point, not a scale-up step.
 */
export type ScaleStagePrior = {
  /** Fraction of titer retained transitioning into this stage (literature range for microbial/mammalian scale-up is roughly 0.75-0.95 per major scale step - see source note below). */
  yieldRetention: number;
  /** Fraction of purity retained transitioning into this stage (downstream purification is generally more forgiving than titer, hence the higher retention factors below). */
  purityRetention: number;
  /** Multiplier applied to the running cost/L to get this stage's cost/L (economies of scale: cost/L falls sharply from microplate screening toward production). */
  costMultiplier: number;
  /** Cycle time in days added at this stage (fed-batch duration + turnaround; larger vessels and added QC/release testing take longer). */
  cycleTimeDays: number;
  /** Additive widening of the cumulative confidence-band fraction at this stage - always > 0 so the band strictly widens stage over stage (compounding scale-up uncertainty). */
  bandWidening: number;
};

export type ScaleUpPriorTable = Record<ScaleStage, ScaleStagePrior>;

/** Identity baseline shared by every path at plate_96w - the measured starting point, no scale-up applied yet. */
const PLATE_BASELINE: ScaleStagePrior = {
  yieldRetention: 1,
  purityRetention: 1,
  costMultiplier: 1,
  cycleTimeDays: 3,
  bandWidening: 0,
};

/**
 * `max_yield`: richest feed strategy and tightest DO/pH control at every
 * scale. Biases the priors toward titer retention at the cost of a slower,
 * more expensive path (industry rule-of-thumb: aggressive fed-batch control
 * retains 85-95% of titer per scale step vs. 75-90% for simpler processes).
 */
const MAX_YIELD_PRIORS = {
  plate_96w: PLATE_BASELINE,
  shake_flask: { yieldRetention: 0.93, purityRetention: 0.99, costMultiplier: 0.55, cycleTimeDays: 4, bandWidening: 0.04 },
  benchtop_bioreactor: { yieldRetention: 0.9, purityRetention: 0.985, costMultiplier: 0.7, cycleTimeDays: 6, bandWidening: 0.05 },
  pilot: { yieldRetention: 0.85, purityRetention: 0.97, costMultiplier: 0.6, cycleTimeDays: 10, bandWidening: 0.06 },
  production: { yieldRetention: 0.82, purityRetention: 0.95, costMultiplier: 0.5, cycleTimeDays: 14, bandWidening: 0.08 },
} satisfies ScaleUpPriorTable;

/**
 * `min_cost`: cheaper batch-fed media and a simpler control strategy at
 * every scale. Lower cost multipliers than `max_yield`, a longer cycle time
 * (simpler process = slower ramp), and slightly lower titer retention
 * (cheaper feed costs some titer at each transition).
 */
const MIN_COST_PRIORS = {
  plate_96w: PLATE_BASELINE,
  shake_flask: { yieldRetention: 0.9, purityRetention: 0.985, costMultiplier: 0.4, cycleTimeDays: 5, bandWidening: 0.045 },
  benchtop_bioreactor: { yieldRetention: 0.86, purityRetention: 0.975, costMultiplier: 0.5, cycleTimeDays: 8, bandWidening: 0.055 },
  pilot: { yieldRetention: 0.8, purityRetention: 0.96, costMultiplier: 0.38, cycleTimeDays: 14, bandWidening: 0.065 },
  production: { yieldRetention: 0.75, purityRetention: 0.93, costMultiplier: 0.3, cycleTimeDays: 20, bandWidening: 0.09 },
} satisfies ScaleUpPriorTable;

/**
 * `fastest`: compressed fed-batch duration and fewer intermediate
 * qualification runs at every scale. Shortest cycle time of the three
 * paths, but the compressed schedule costs both titer retention and
 * confidence (band widens fastest of the three).
 */
const FASTEST_PRIORS = {
  plate_96w: PLATE_BASELINE,
  shake_flask: { yieldRetention: 0.88, purityRetention: 0.98, costMultiplier: 0.6, cycleTimeDays: 3, bandWidening: 0.05 },
  benchtop_bioreactor: { yieldRetention: 0.83, purityRetention: 0.965, costMultiplier: 0.75, cycleTimeDays: 4, bandWidening: 0.065 },
  pilot: { yieldRetention: 0.78, purityRetention: 0.95, costMultiplier: 0.65, cycleTimeDays: 6, bandWidening: 0.08 },
  production: { yieldRetention: 0.74, purityRetention: 0.92, costMultiplier: 0.55, cycleTimeDays: 8, bandWidening: 0.11 },
} satisfies ScaleUpPriorTable;

/**
 * The three named prior weight tables. `satisfies Record<ScaleUpPathId,
 * ScaleUpPriorTable>` (and each table's own `satisfies ScaleUpPriorTable`
 * above) makes a missing stage or a missing path a compile error, never a
 * silent `undefined` at runtime.
 */
export const SCALEUP_PRIORS = {
  max_yield: MAX_YIELD_PRIORS,
  min_cost: MIN_COST_PRIORS,
  fastest: FASTEST_PRIORS,
} satisfies Record<ScaleUpPathId, ScaleUpPriorTable>;

/**
 * Illustrative anchor constants - order-of-magnitude starting points for the
 * relative multipliers above, not a validated cost/purity model. Cited in
 * per-node tooltips so nothing is a black-box number.
 */
const BASELINE_COST_PER_L = 1200; // $/L at 96-well/microplate scale - dominated by per-well reagent + labor overhead.
const BASELINE_PURITY_PRIOR = 92; // % purity assumed when unmeasured - typical crude lab-scale value ahead of downstream polishing.

const PATH_META: Record<ScaleUpPathId, { label: string; reason: string }> = {
  max_yield: {
    label: "Max yield",
    reason: "Richest feed strategy and tightest DO/pH control at each scale - trades cost and time for titer retention.",
  },
  min_cost: {
    label: "Min cost",
    reason: "Cheaper batch-fed media and a simpler control strategy at each scale - trades some titer for lower cost/L.",
  },
  fastest: {
    label: "Fastest",
    reason: "Compressed fed-batch duration and fewer intermediate qualification runs - trades titer and confidence for speed.",
  },
};

export type BandedValue = { value: number; band: number };

export type ScaleUpStagePoint = {
  stage: ScaleStage;
  volumeLabel: string;
  yield: BandedValue;
  purity: BandedValue;
  costPerL: BandedValue;
  timeDays: BandedValue;
};

export type ScaleUpPath = {
  id: ScaleUpPathId;
  label: string;
  reason: string;
  stages: ScaleUpStagePoint[];
};

/**
 * Projects the current best recipe/objectives through the five scale-up
 * stages along 2-3 named paths. Deterministic: identical inputs always
 * produce identical output, since every stage value is `reference * running
 * cumulative product/sum` over the fixed prior tables - there is no
 * sampling anywhere in this function.
 *
 * `bestRecipe` is threaded through the public signature (per the spec) for
 * a future recipe-conditioned scale-up model; the current priors are
 * generic literature values that do not vary by recipe composition - there
 * is no physics/literature basis yet to condition them on it.
 *
 * Band semantics: each metric's band is `referenceValue * cumulativeBandFrac`,
 * where `referenceValue` is that metric's fixed plate-scale value and
 * `cumulativeBandFrac` is the running sum of `bandWidening` (which is > 0 at
 * every stage past plate_96w for every path/table above). Anchoring the band
 * to a fixed reference - rather than to each stage's own shrinking/growing
 * value - guarantees the band strictly widens stage over stage regardless
 * of which direction the point estimate itself moves.
 */
export function projectScaleUp(
  bestRecipe: Record<string, number>,
  bestObjectives: { yield: number; purity?: number },
  priors: Record<ScaleUpPathId, ScaleUpPriorTable> = SCALEUP_PRIORS,
): ScaleUpPath[] {
  void bestRecipe; // not yet used - see the doc comment above.
  const baselineYield = bestObjectives.yield;
  const baselinePurity = bestObjectives.purity ?? BASELINE_PURITY_PRIOR;

  return (Object.keys(priors) as ScaleUpPathId[]).map((id) => {
    const table = priors[id];
    let yieldCum = 1;
    let purityCum = 1;
    let costCum = 1;
    let timeCum = 0;
    let bandFrac = 0;

    const stages: ScaleUpStagePoint[] = SCALE_STAGES.map(({ stage, volumeLabel }) => {
      const p = table[stage];
      yieldCum *= p.yieldRetention;
      purityCum *= p.purityRetention;
      costCum *= p.costMultiplier;
      timeCum += p.cycleTimeDays;
      bandFrac += p.bandWidening;

      const yieldValue = baselineYield * yieldCum;
      const purityValue = baselinePurity * purityCum;
      const costValue = BASELINE_COST_PER_L * costCum;
      const timeValue = timeCum;

      return {
        stage,
        volumeLabel,
        yield: { value: yieldValue, band: baselineYield * bandFrac },
        purity: { value: purityValue, band: baselinePurity * bandFrac },
        costPerL: { value: costValue, band: BASELINE_COST_PER_L * bandFrac },
        timeDays: { value: timeValue, band: PLATE_BASELINE.cycleTimeDays * bandFrac },
      };
    });

    return { id, label: PATH_META[id].label, reason: PATH_META[id].reason, stages };
  });
}

/**
 * One-line tradeoff delta vs. the plate baseline (the first stage), for the
 * text comparison rows above the stepper - e.g. "-88% cost/L · 37 d total ·
 * 82% purity retained". Cost/purity are relative to the plate-stage value on
 * the same path; time is the total cumulative cycle time to production.
 */
export function pathSummary(path: ScaleUpPath): string {
  const first = path.stages[0];
  const last = path.stages[path.stages.length - 1];
  const costDeltaPct = first.costPerL.value === 0 ? 0 : ((last.costPerL.value - first.costPerL.value) / first.costPerL.value) * 100;
  const purityRetainedPct = first.purity.value === 0 ? 0 : (last.purity.value / first.purity.value) * 100;
  const totalDays = Math.round(last.timeDays.value);
  const costSign = costDeltaPct >= 0 ? "+" : "";
  return `${costSign}${Math.round(costDeltaPct)}% cost/L · ${totalDays} d total · ${Math.round(purityRetainedPct)}% purity retained`;
}
