/*
 * Pure rules for the campaign setup (goal, target unit, bounds, linear constraints): the form draft, the
 * client-side checks that mirror the engine's (kalos-engine PUT /api/campaigns/{id}/setup), the engine's 400
 * codes in plain words with what would fix them, and how an analysis's applied setup reads. No React, so
 * every rule is unit tested in __tests__/setup-logic.test.ts. The engine stays the authority: its own 400 is
 * always shown when it still refuses.
 */

import type { AppliedSetup, Goal, LinearConstraint, SetupDoc, SetupView } from "@/lib/api";
import { EngineError, errorMessage } from "@/lib/engine-error";
import { MINUS } from "@/lib/num";

/** Engine limits (ENGINE_API_V2 section 8). */
export const UNIT_MAX = 32;
export const MAX_BOUNDS = 64;
export const MAX_CONSTRAINTS = 16;
export const MAX_TERMS = 64;
export const ABS_MAX = 1e12;

/** One continuous input the form can bound, with the observed range it shows next to the bound. */
export type SetupInput = {
  name: string;
  /** Observed low/high: the engine's (bounds_report / feature_ranges) after an upload, the browser's sheet read before one. */
  observed: [number, number] | null;
  /** What the engine will search after intersecting the bound with the observed data (GET /setup bounds_report). */
  effective?: [number, number] | null;
  extrapolates?: boolean | null;
};

export type BoundDraft = { lo: string; hi: string };
export type TermDraft = { feature: string; coef: string };
export type ConstraintDraft = { key: number; terms: TermDraft[]; op: "<=" | ">="; rhs: string };
export type SetupDraft = { goal: Goal; unit: string; bounds: Record<string, BoundDraft>; constraints: ConstraintDraft[] };

let nextKey = 1;
/** A fresh, empty constraint row (one blank term). */
export function emptyConstraint(): ConstraintDraft {
  return { key: nextKey++, terms: [{ feature: "", coef: "1" }], op: "<=", rhs: "" };
}

/** A number as the user typed it, echoed back with a real minus sign (never rounded: it is their input). */
export const plainNumber = (n: number): string => String(n).replace("-", MINUS);

/** Inputs echo numbers without the U+2212 minus so they parse again. */
const inputNumber = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? "" : String(n));

export function draftFromSetup(doc: SetupDoc | null | undefined): SetupDraft {
  if (!doc) return { goal: "maximize", unit: "", bounds: {}, constraints: [] };
  const bounds: Record<string, BoundDraft> = {};
  for (const [f, b] of Object.entries(doc.bounds ?? {})) bounds[f] = { lo: inputNumber(b.lo), hi: inputNumber(b.hi) };
  return {
    goal: doc.goal === "minimize" ? "minimize" : "maximize",
    unit: doc.target_unit ?? "",
    bounds,
    constraints: (doc.linear_constraints ?? []).map((c) => ({
      key: nextKey++,
      terms: Object.entries(c.coefficients).map(([feature, coef]) => ({ feature, coef: inputNumber(coef) })),
      op: c.op,
      rhs: inputNumber(c.rhs),
    })),
  };
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A typed number (a U+2212 minus is accepted), or null when it is not one. */
export function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(/\u2212/g, "-");
  if (!NUMBER.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// C0/C1 control characters and format characters (bidi overrides, zero-width), which the engine refuses.
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;

/** Null when the unit is acceptable (blank = no unit set), else the reason. */
export function validateUnit(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;
  if (CONTROL_OR_FORMAT.test(t)) return "The unit cannot contain control or invisible formatting characters.";
  const n = [...t].length;
  if (n > UNIT_MAX) return `The unit can be at most ${UNIT_MAX} characters; this one has ${n}.`;
  return null;
}

export type DraftIssue = { field: string; message: string };
export type BuildResult = { ok: true; doc: SetupDoc; notes: string[] } | { ok: false; issues: DraftIssue[] };

/** Field keys for issues, so the form can put each message next to its control. */
export const boundField = (f: string) => `bound:${f}`;
export const constraintField = (i: number) => `constraint:${i}`;

/**
 * The SetupDoc to PUT, or the issues that would make the engine refuse it. A bound needs both ends (the engine
 * requires both); an end left blank takes the observed value when one is known, and a note says so. A bound
 * that misses the observed range entirely is refused here, because no proposal could meet it.
 */
export function buildSetupDoc(draft: SetupDraft, inputs: readonly SetupInput[]): BuildResult {
  const issues: DraftIssue[] = [];
  const notes: string[] = [];
  const byName = new Map(inputs.map((i) => [i.name, i]));

  const unitProblem = validateUnit(draft.unit);
  if (unitProblem) issues.push({ field: "unit", message: unitProblem });

  const bounds: SetupDoc["bounds"] = {};
  for (const [f, b] of Object.entries(draft.bounds)) {
    const loText = b.lo.trim();
    const hiText = b.hi.trim();
    if (loText === "" && hiText === "") continue;
    const input = byName.get(f);
    if (!input) {
      notes.push(`The bound on ${f} was left out: ${f} is not a numeric input of this sheet.`);
      continue;
    }
    const obs = input.observed;
    let lo = loText === "" ? null : parseNumber(loText);
    let hi = hiText === "" ? null : parseNumber(hiText);
    if ((loText !== "" && lo === null) || (hiText !== "" && hi === null)) {
      issues.push({ field: boundField(f), message: "Enter numbers only." });
      continue;
    }
    if (lo === null || hi === null) {
      if (!obs) {
        issues.push({ field: boundField(f), message: "Enter both a low and a high: the observed range is not known yet." });
        continue;
      }
      if (lo === null) {
        lo = obs[0];
        notes.push(`${f}: the low was left blank, so the observed low (${plainNumber(obs[0])}) is used.`);
      } else {
        hi = obs[1];
        notes.push(`${f}: the high was left blank, so the observed high (${plainNumber(obs[1])}) is used.`);
      }
    }
    if (Math.abs(lo) > ABS_MAX || Math.abs(hi!) > ABS_MAX) {
      issues.push({ field: boundField(f), message: "Numbers must be at most 1e12 in size." });
      continue;
    }
    if (!(lo < hi!)) {
      issues.push({ field: boundField(f), message: "The low must be below the high." });
      continue;
    }
    if (obs && (hi! < obs[0] || lo > obs[1])) {
      issues.push({
        field: boundField(f),
        message: `This range does not overlap the observed ${plainNumber(obs[0])} to ${plainNumber(obs[1])}, so no proposal could meet it. Kalos never searches beyond your data.`,
      });
      continue;
    }
    bounds[f] = { lo, hi: hi! };
  }
  if (Object.keys(bounds).length > MAX_BOUNDS) issues.push({ field: "bounds", message: `At most ${MAX_BOUNDS} bounds are accepted.` });

  const constraints: LinearConstraint[] = [];
  draft.constraints.forEach((c, i) => {
    const field = constraintField(i);
    const terms = c.terms.filter((t) => t.feature !== "" || t.coef.trim() !== "");
    if (terms.length === 0 && c.rhs.trim() === "") return; // an untouched row is ignored
    if (terms.length === 0) return issues.push({ field, message: "Add at least one input to this constraint." });
    if (terms.length > MAX_TERMS) return issues.push({ field, message: `A constraint can have at most ${MAX_TERMS} terms.` });
    const coefficients: Record<string, number> = {};
    for (const t of terms) {
      if (!t.feature) return issues.push({ field, message: "Choose an input for every term." });
      if (!byName.has(t.feature)) return issues.push({ field, message: `${t.feature} is not a numeric input of this sheet.` });
      if (t.feature in coefficients) return issues.push({ field, message: `${t.feature} appears twice; combine its coefficients into one term.` });
      const k = parseNumber(t.coef);
      if (k === null) return issues.push({ field, message: `Enter a number as the coefficient of ${t.feature}.` });
      if (k === 0) return issues.push({ field, message: `The coefficient of ${t.feature} must not be zero.` });
      if (Math.abs(k) > ABS_MAX) return issues.push({ field, message: "Numbers must be at most 1e12 in size." });
      coefficients[t.feature] = k;
    }
    const rhs = parseNumber(c.rhs);
    if (rhs === null) return issues.push({ field, message: "Enter a number on the right-hand side." });
    if (Math.abs(rhs) > ABS_MAX) return issues.push({ field, message: "Numbers must be at most 1e12 in size." });
    constraints.push({ coefficients, op: c.op, rhs });
  });
  if (constraints.length > MAX_CONSTRAINTS) issues.push({ field: "constraints", message: `At most ${MAX_CONSTRAINTS} constraints are accepted.` });

  if (issues.length > 0) return { ok: false, issues };
  const unit = draft.unit.trim();
  return { ok: true, notes, doc: { goal: draft.goal, bounds, linear_constraints: constraints, target_unit: unit === "" ? null : unit } };
}

/** "1 × glucose_gL + 2 × glutamine_mM ≤ 12", the user's own numbers echoed back. */
export function constraintText(c: LinearConstraint): string {
  const lhs = Object.entries(c.coefficients)
    .map(([f, k], i) => {
      const sign = k < 0 ? (i === 0 ? MINUS : ` ${MINUS} `) : i === 0 ? "" : " + ";
      return `${sign}${plainNumber(Math.abs(k))} × ${f}`;
    })
    .join("");
  return `${lhs} ${c.op === "<=" ? "≤" : "≥"} ${plainNumber(c.rhs)}`;
}

// --- The engine's answers in plain words ------------------------------------------------------------------

export type SetupErrorCopy = {
  /** What happened, in plain words (never the raw code). */
  message: string;
  /** What would fix it, when known. */
  fix: string | null;
  /** Raw engine values for the disclosure. */
  code: string | null;
  detail: string | null;
};

const PUT_COPY: Record<string, { message: string; fix: string | null }> = {
  invalid_body: {
    message: "The engine could not read the setup: something is not in the shape it expects.",
    fix: "Give every bound both a low and a high number, and every constraint at least one input and a right-hand side.",
  },
  invalid_setup: { message: "The engine refused part of the setup, such as the target unit.", fix: `Use at most ${UNIT_MAX} characters for the unit, with no control or invisible characters.` },
  invalid_bounds: { message: "A bound is not valid: its low must be below its high, and both must be finite numbers.", fix: "Correct the low and high of that bound." },
  invalid_constraint: { message: "A constraint is not valid: a coefficient is zero, or a number is not finite.", fix: "Give every term a non-zero coefficient and the constraint a finite right-hand side." },
  target_not_a_feature: { message: "A bound or constraint names the target column. The target is optimized, not bounded.", fix: "Bound process inputs only." },
  unknown_feature: {
    message: "A bound or constraint names a column that is not a continuous input of this campaign's analysis.",
    fix: "Use the inputs listed in the form. To bound another column, re-fit with it as an input first.",
  },
  categorical_feature: { message: "A bound names a categorical input. Bounds apply to numeric inputs only.", fix: "Remove the bound on that input." },
  constraints_with_categoricals: {
    message: "This campaign's design has a categorical input, and the optimizer does not support linear constraints together with categorical inputs.",
    fix: "Remove the linear constraints (bounds still work), or remove the categorical column from the sheet and upload it again.",
  },
  bounds_outside_data: {
    message: "A bound does not overlap the range observed in your data, so no proposal could satisfy it.",
    fix: "Set a range that overlaps the observed low and high shown next to each input.",
  },
  infeasible_constraints: {
    message: "No recipe satisfies the bounds and the constraints together.",
    fix: "Loosen a constraint's right-hand side or widen a bound. They are checked together, inside the observed data range.",
  },
  degenerate_constraints: {
    message: "The bounds and constraints leave only a boundary with no room inside it (for example a ≤ and a ≥ with the same right-hand side).",
    fix: "Give equality-like constraints a small tolerance, for example ≤ 1.01 and ≥ 0.99.",
  },
  feasibility_unverified: { message: "The engine could not verify that the constraints can be met: its solver did not converge.", fix: "Simplify the constraints, then save again." },
  setup_too_large: { message: "The setup is larger than the engine accepts.", fix: `Use at most ${MAX_BOUNDS} bounds and ${MAX_CONSTRAINTS} constraints of at most ${MAX_TERMS} terms each.` },
  campaign_archived: { message: "This campaign is archived, so its setup cannot change.", fix: "Ask an organization admin to unarchive it." },
  insufficient_scope: { message: "Your role in this organization cannot change campaigns.", fix: "Ask an organization admin for a member role." },
};

export function setupErrorCopy(err: unknown): SetupErrorCopy {
  if (err instanceof EngineError) {
    const known = PUT_COPY[err.code];
    // The engine's own `what_would_fix_it` wins when it sent one (it names the exact entry); ours is the fallback.
    if (known) return { ...known, fix: err.fix ?? known.fix, code: err.code, detail: err.detail ?? null };
    return { message: errorMessage(err).message, fix: err.fix ?? null, code: err.code, detail: err.detail ?? null };
  }
  return { message: errorMessage(err).message, fix: null, code: null, detail: null };
}

/** Titles for `analysis.setup.refusal.code`: the setup could not be honoured, so the batch is empty. */
const REFUSAL_TITLE: Record<string, string> = {
  constraints_with_categoricals: "Linear constraints cannot be used with this sheet, because it has a categorical input",
  constraint_feature_not_modeled: "A constraint names a column the model does not use as an input",
  bound_on_categorical: "A bound names a categorical input",
  bounds_outside_data: "A bound does not overlap the observed data",
  infeasible_constraints: "No recipe satisfies the bounds and constraints together",
  degenerate_constraints: "The bounds and constraints leave no room inside them",
  constraints_unsatisfiable: "No proposal could satisfy the constraints",
  setup_unreadable: "The stored setup could not be read",
};

const WARNING_TEXT: Record<string, (w: { feature?: string }) => string> = {
  bound_extrapolates: (w) => `The bound on ${w.feature ?? "an input"} reaches past your data. Proposals stay inside the observed range; the model is not extrapolated.`,
  gp_shapes_swept_at_highest_run: () =>
    "The per-input shape summaries sweep each input through the run with the highest measured target. With a minimize goal, read their interior minimum as the candidate optimum.",
};

export type AppliedBoundRow = {
  feature: string;
  requested: [number | null, number | null];
  observed: [number, number] | null;
  applied: [number, number] | null;
  extrapolates: boolean;
};

export type AppliedSetupView = {
  status: "applied" | "refused" | "unknown";
  goal: Goal;
  bounds: AppliedBoundRow[];
  constraints: string[];
  warnings: { text: string; code: string; raw: string }[];
  /** Proposals dropped for breaking a bound or constraint (null when the engine did not say). */
  dropped: number | null;
  refusal: { title: string; reason: string | null; fix: string | null; code: string } | null;
  signConvention: string | null;
};

/** How an analysis's `setup` block reads. */
export function describeAppliedSetup(s: AppliedSetup): AppliedSetupView {
  const status = s.status === "applied" || s.status === "refused" ? s.status : "unknown";
  const bounds = Object.entries(s.bounds_applied ?? {}).map(([feature, b]) => ({
    feature,
    requested: b.requested,
    observed: b.observed,
    applied: b.applied,
    extrapolates: !!b.extrapolates,
  }));
  const r = s.refusal ?? null;
  return {
    status,
    goal: s.goal === "minimize" ? "minimize" : "maximize",
    bounds,
    constraints: (s.constraints_applied ?? []).map(constraintText),
    warnings: (s.warnings ?? []).map((w) => ({ code: w.code, raw: w.message, text: WARNING_TEXT[w.code]?.(w) ?? w.message })),
    dropped: typeof s.n_proposals_dropped === "number" ? s.n_proposals_dropped : null,
    refusal: r
      ? {
          code: r.code,
          title: REFUSAL_TITLE[r.code] ?? "The campaign setup could not be applied",
          reason: r.reason ?? r.message ?? null,
          fix: r.what_would_fix_it ?? null,
        }
      : null,
    signConvention: typeof s.sign_convention === "string" ? s.sign_convention : null,
  };
}

/**
 * Whether the stored setup is what the current analysis used. The engine applies the setup on upload and on
 * re-analysis; a re-analysis needs at least one measured result (400 nothing_to_fold), so a campaign with none
 * applies a changed setup only by uploading the sheet again.
 */
export type SyncState = { kind: "no-analysis" } | { kind: "in-sync" } | { kind: "reanalyze" } | { kind: "reupload" };

export function setupSync(view: Pick<SetupView, "settings_in_sync" | "has_analysis">, nMeasured: number | null): SyncState {
  if (!view.has_analysis || view.settings_in_sync === null) return { kind: "no-analysis" };
  if (view.settings_in_sync) return { kind: "in-sync" };
  return nMeasured != null && nMeasured > 0 ? { kind: "reanalyze" } : { kind: "reupload" };
}

/** True when two setups ask for the same thing (the form is unchanged). */
export function sameSetup(a: SetupDoc, b: SetupDoc): boolean {
  const norm = (d: SetupDoc) =>
    JSON.stringify({
      g: d.goal,
      u: d.target_unit ?? null,
      b: Object.keys(d.bounds)
        .sort()
        .map((k) => [k, d.bounds[k].lo, d.bounds[k].hi]),
      c: d.linear_constraints.map((c) => [Object.entries(c.coefficients).sort(([x], [y]) => x.localeCompare(y)), c.op, c.rhs]),
    });
  return norm(a) === norm(b);
}
