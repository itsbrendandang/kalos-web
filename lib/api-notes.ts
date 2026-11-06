// plain-words: disclosure-only
/*
 * One-line notes built from the engine's newer response fields, in the
 * engine's own vocabulary (rho, n, held-out, ECE). None of them is rendered on
 * a main surface: they exist for disclosures and for their regression tests
 * (__tests__/honesty-parity.test.ts, honesty-fixes.test.ts), and lib/api.ts
 * re-exports them so callers keep one import. Same contract as every helper
 * in lib/api.ts: absent field -> null (render nothing); present but
 * unmeasured -> the engine's own stated reason, never a fabricated number.
 */
import { isReliable, type AnalyzeResult, type Calibration, type CvGroupMeanBaseline, type CvLogo, type CvTopK, type DesignBoxExclusion, type DriverSelection, type ProposalGating } from "@/lib/api";

/**
 * Why a dataset is or is not reliable, in one short phrase, using the engine's
 * OWN floor rather than a hardcoded number.
 *
 * This exists because `/results` used to render
 * `reliable ? "Clears the 0.20 floor" : "Below the 0.20 floor"`, which was wrong
 * in two ways at once. It hardcoded a floor the engine owns and reports as
 * `reliability.spearman_floor`, and - worse - `reliable` is `isReliable()`,
 * which is `clears_floor AND ci_excludes_zero`. So a model that genuinely
 * CLEARED the floor but whose 95% CI still included zero was told "Below the
 * 0.20 floor": a false statement about its own score, and the wrong reason for
 * the right verdict. A scientist debugging why their run was not trusted would
 * have gone looking at the wrong number.
 *
 * The two failure modes are distinguished, because the fix for them differs: a
 * rho below the floor needs a better model or better data, while a CI spanning
 * zero at an adequate rho usually just needs more runs.
 */
// Not rendered anywhere (kept for its regression test); the surfaces use reliabilityVerdict's plain reason.
export function reliabilityReason(
  d: Pick<AnalyzeResult, "reliability" | "cv_ci95" | "cv_spearman">,
): string {
  const rel = d.reliability;
  if (!rel) return isReliable(d) ? "Clears the trust floor" : "Below the trust floor";
  const floor = rel.spearman_floor.toFixed(2);
  if (!rel.clears_floor) return `Below the ${floor} floor`;
  if (!rel.ci_excludes_zero) return `Clears the ${floor} floor, but its 95% CI includes zero`;
  return `Clears the ${floor} floor`;
}

/**
 * One-line disclosure of how the engine selected which drivers to report -
 * how many candidate features were tested and how many survived to the
 * displayed top slice. Returns `null` when the engine didn't report
 * `driver_selection` (an older engine build) - render nothing rather than
 * imply a selection process that wasn't disclosed.
 */
export function driverSelectionNote(sel: DriverSelection | null | undefined): string | null {
  if (!sel) return null;
  const base = `${sel.n_tested} feature${sel.n_tested === 1 ? "" : "s"} tested - showing the top ${sel.n_reported}, ranked by ${sel.ranked_by} (${sel.fdr_method} FDR, q=${sel.fdr_q}).`;
  if (sel.unit == null || sel.n_units == null || sel.n_rows == null) return base;
  return `${base} Tested per ${sel.unit} (${sel.n_units} ${sel.unit}${sel.n_units === 1 ? "" : "s"}, ${sel.n_rows} row${sel.n_rows === 1 ? "" : "s"}).`;
}

// --- Honesty-parity helpers -------------------------------------------------
// Pure formatters for the engine's newer response fields, following the same
// contract every helper above already does: absent field -> null (render
// nothing); present-but-unmeasured -> the engine's own stated reason, never a
// fabricated number. Kept here rather than inline in components so the
// render-or-explain logic is unit-testable without a DOM.

/**
 * Held-out prediction-interval calibration (`reliability.calibration`): is
 * the stated +/- band honest, not just the ranking. `null` when the field is
 * absent (older engine build) - render nothing. When the engine could not
 * measure it on this sheet (`available: false`), returns the engine's own
 * reason rather than a fabricated ECE.
 */
export function calibrationNote(cal: Calibration | null | undefined): string | null {
  if (!cal) return null;
  if (!cal.available) return `Not scored - ${cal.reason ?? "not enough held-out points"}.`;
  const parts = [`ECE ${cal.ece != null ? cal.ece.toFixed(2) : "n/a"}`];
  if (cal.z_std != null) {
    const shape = cal.z_std > 1 ? "bands read narrow, overconfident" : cal.z_std < 1 ? "bands read wide" : "well-calibrated";
    parts.push(`z_std ${cal.z_std.toFixed(2)} (${shape})`);
  }
  return `${parts.join(" - ")}, n=${cal.n}.`;
}

/**
 * Per-repeat pooled Spearman spread (`cv_n_repeats`/`cv_spearman_per_repeat`) -
 * `cv_ci95` already reflects this partition-to-partition variance in its
 * width; this surfaces the spread itself, subtly, beside the point estimate.
 * `null` when there is nothing to add: fewer than 2 finite repeats, or the
 * fields are absent (older engine build).
 */
export function repeatSpreadNote(
  nRepeats: number | null | undefined,
  perRepeat: (number | null)[] | null | undefined,
): string | null {
  const finite = (perRepeat ?? []).filter((v): v is number => v != null);
  if (finite.length < 2) return null;
  const lo = Math.min(...finite).toFixed(2);
  const hi = Math.max(...finite).toFixed(2);
  return `${nRepeats ?? finite.length} repeats: ${lo} to ${hi}`;
}

/**
 * Leave-one-group-out generalization (`cv_logo`) - the harder question of
 * generalizing to the NEXT group the model has seen nothing like. `null`
 * when the field is absent (older engine build); the engine's own `reason`
 * when it could not be computed on this sheet (no group column, or too many
 * groups to afford it) rather than silence.
 */
export function cvLogoNote(logo: CvLogo | null | undefined): string | null {
  if (!logo) return null;
  if (logo.spearman == null) return logo.reason ?? "Not scored.";
  return `rho ${logo.spearman.toFixed(2)} across ${logo.n_groups} held-out group${logo.n_groups === 1 ? "" : "s"} (n=${logo.n_oof}).`;
}

/**
 * "Of the true top-k recipes, how many did the model's top-k catch"
 * (`cv_topk`). `null` when the field is absent (older engine build);
 * `evaluable: false` renders the engine's stated reason rather than a number
 * that looks measured.
 */
export function cvTopKNote(topk: CvTopK | null | undefined): string | null {
  if (!topk) return null;
  if (!topk.evaluable || topk.overlap == null) return topk.reason ?? "Not scored.";
  const hits = Math.round(topk.overlap * topk.k);
  return `${hits} of the true top ${topk.k} caught (n=${topk.n}).`;
}

/**
 * The group-mean baseline floor (`cv_group_mean_baseline`): how much of the
 * apparent CV signal is just the model recognizing which recipe a row
 * belongs to. `null` when the field is absent (older engine build).
 * Otherwise always returns text - the engine's stated `reason` when the
 * baseline itself could not be computed, or a line built from `spearman` and
 * `interpretation` when it could - plus `prominent`, true when the caller
 * should surface this as a loud callout rather than a quiet mention: the
 * model's own `cv_spearman` does not clearly beat the floor (does not
 * strictly exceed it), which is the honest moment this field exists for.
 */
export function groupMeanBaselineVerdict(
  cvSpearman: number | null | undefined,
  baseline: CvGroupMeanBaseline | null | undefined,
): { text: string; prominent: boolean } | null {
  if (!baseline) return null;
  if (baseline.spearman == null) {
    return { text: baseline.reason ?? "Not scored.", prominent: false };
  }
  const beats = cvSpearman != null && cvSpearman > baseline.spearman;
  const text = `Group-mean baseline rho ${baseline.spearman.toFixed(2)} (n=${baseline.n_evaluable} rows, ${baseline.n_groups_used} groups)${
    baseline.interpretation ? ` - ${baseline.interpretation}` : ""
  }`;
  return { text, prominent: !beats };
}

/**
 * Which region of the recipe space was actually searched, when narrowed
 * because some observed cells were physically impossible
 * (`design_box_exclusions`) - so a consumer never assumes the search box is
 * the full data range. `null` when nothing was excluded, or the field is
 * absent (older engine build).
 */
export function designBoxExclusionsNote(exclusions: DesignBoxExclusion[] | null | undefined): string | null {
  if (!exclusions || exclusions.length === 0) return null;
  const parts = exclusions.map(
    (e) => `${e.column} (${e.lower.toFixed(2)} to ${e.upper.toFixed(2)}, ${e.n_excluded} row${e.n_excluded === 1 ? "" : "s"} excluded)`,
  );
  return `Search box narrowed for ${exclusions.length} feature${exclusions.length === 1 ? "" : "s"}: ${parts.join("; ")}.`;
}

/**
 * How this batch was actually computed (`proposal_optimizer`/
 * `n_pending_considered`) - mirrors the seed/timestamp/engine_version audit
 * trail: a large categorical space silently switches optimizers, and
 * in-flight recipes change what the acquisition already knew about. `null`
 * only when the engine reported neither (older engine build).
 */
export function proposalAuditNote(optimizer: string | null | undefined, nPending: number | null | undefined): string | null {
  const parts: string[] = [];
  if (optimizer) parts.push(`${optimizer} optimizer`);
  if (nPending != null) parts.push(`${nPending} in-flight recipe${nPending === 1 ? "" : "s"} considered`);
  return parts.length ? parts.join(" - ") : null;
}

/**
 * Whether/why the proposal acquisition was gated by predicted feasibility
 * (`proposal_gating`). `null` when the field is absent (older engine build,
 * or an engine build before this NEW optimistic field shipped).
 */
export function proposalGatingNote(gating: ProposalGating | null | undefined): string | null {
  if (!gating) return null;
  return gating.reason;
}
