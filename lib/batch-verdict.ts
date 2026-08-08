import type { Proposal } from "@/lib/api";

/**
 * How a proposed batch reads against the incumbent, once uncertainty is applied.
 *
 * Both headline banners (`/results` ReliabilityVerdict and `/decide`
 * BatchVerdict) ask the same question and used to answer it with their own
 * copy of this arithmetic. They drifted: each counted with the conformal band
 * but described the count as a plain point prediction, so a banner reading
 * "none is predicted to beat your current best" sat directly above a table
 * showing those same recipes at "+6.75" and "predicted high (+7.93 vs best)".
 *
 * The distinction the copy has to carry:
 *   - `nAbove`  - point prediction is above `best`. What the table shows.
 *   - `beats`   - clears `best` even at the PESSIMISTIC edge of the band. The
 *                 strict test worth acting on.
 * `nAbove > beats` is the normal case on small bioprocess data, and it is
 * exactly the case where a banner that only quotes `beats` reads as a lie.
 */
export type BatchVerdict = {
  /** Proposals whose point prediction exceeds `best`. */
  nAbove: number;
  /** Proposals clearing `best` at the low end of their band. */
  beats: number;
  /** Total proposals considered. */
  total: number;
  /**
   * The band to name in the copy: the shared conformal band when the engine
   * returned one, else null - per-proposal `std` varies, so there is no single
   * number to quote and the caller must fall back to generic wording.
   */
  band: number | null;
};

/**
 * Count a batch against `best`. `band` is the shared conformal band; when it is
 * null each proposal falls back to its own `std`, matching what the cards show.
 */
export function batchVerdict(proposals: Proposal[], best: number, band: number | null): BatchVerdict {
  return {
    nAbove: proposals.filter((p) => p.pred > best).length,
    beats: proposals.filter((p) => p.pred - (band ?? p.std) >= best).length,
    total: proposals.length,
    band,
  };
}

/**
 * How to refer to the applied uncertainty in a sentence: a concrete "±3.70"
 * when one shared band covers every proposal, else generic wording.
 */
export function bandLabel(band: number | null, digits = 2): string {
  return band != null ? `±${band.toFixed(digits)}` : "their uncertainty";
}

/**
 * One proposal's honest read against the incumbent.
 *
 * `"beats"` only when the WHOLE band sits above `best`, `"below"` only when it
 * sits entirely under, `"coin-flip"` for the overlap the model cannot call.
 * This is what stops a batch of wide-banded predictions from reading as a
 * confident ranked list.
 *
 * Shared so `/results` and `/decide` cannot disagree about the same proposal;
 * each maps the result to its own wording and tone. Whatever `band` a caller
 * passes here is the band it must also DISPLAY - showing `±std` next to a
 * verdict computed from the conformal band made the row contradict itself
 * (`57.49 ± 3.18 (+0.19 ~best)`: at ±3.18 the interval clears `best` outright,
 * so "~best" looked wrong; the verdict had used ±8.99).
 */
export type ProposalVerdict = "beats" | "below" | "coin-flip";

export function proposalVerdict(pred: number, band: number, best: number): ProposalVerdict {
  if (pred - band >= best) return "beats";
  if (pred + band <= best) return "below";
  return "coin-flip";
}
