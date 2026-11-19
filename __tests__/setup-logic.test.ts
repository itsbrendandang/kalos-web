import { describe, expect, it } from "vitest";
import type { AppliedSetup, SetupView } from "@/lib/api";
import { EngineError } from "@/lib/engine-error";
import {
  buildSetupDoc,
  constraintText,
  describeAppliedSetup,
  draftFromSetup,
  parseNumber,
  sameSetup,
  setupErrorCopy,
  setupSync,
  validateUnit,
  type SetupDraft,
  type SetupInput,
} from "@/components/setup/setup-logic";
import { setupInputsFromAnalysis } from "@/components/setup/setup-section";
import refused from "./fixtures/setup-v2-refused-analysis.json";
import outOfSync from "./fixtures/setup-v2-view-out-of-sync.json";

const inputs: SetupInput[] = [
  { name: "pH", observed: [6.005, 7.594] },
  { name: "glucose_gL", observed: [2.004, 11.956] },
  { name: "glutamine_mM", observed: [1.032, 8] },
  { name: "unknown_range", observed: null },
];
const draft = (over: Partial<SetupDraft> = {}): SetupDraft => ({ goal: "maximize", unit: "", bounds: {}, constraints: [], ...over });

describe("parseNumber and validateUnit", () => {
  it("accepts plain and U+2212 numbers, refuses the rest", () => {
    expect(parseNumber(" 6.5 ")).toBe(6.5);
    expect(parseNumber("\u22122")).toBe(-2);
    expect(parseNumber("1e3")).toBe(1000);
    expect(parseNumber("6,5")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
  it("mirrors the engine's unit rule: at most 32 characters, no control or format characters", () => {
    expect(validateUnit("")).toBeNull();
    expect(validateUnit("g/L")).toBeNull();
    expect(validateUnit("a".repeat(32))).toBeNull();
    expect(validateUnit("a".repeat(33))).toMatch(/at most 32 characters; this one has 33/);
    expect(validateUnit("g\u0001L")).toMatch(/control/);
    expect(validateUnit("g\u202eL")).toMatch(/control/);
  });
});

describe("buildSetupDoc", () => {
  it("builds the engine's SetupDoc: goal, trimmed unit, bounds, constraints", () => {
    const r = buildSetupDoc(
      draft({
        goal: "minimize",
        unit: " g/L ",
        bounds: { pH: { lo: "6.5", hi: "9" }, glucose_gL: { lo: "", hi: "" } },
        constraints: [{ key: 1, terms: [{ feature: "glucose_gL", coef: "1" }, { feature: "glutamine_mM", coef: "2" }], op: "<=", rhs: "15" }],
      }),
      inputs,
    );
    expect(r).toEqual({
      ok: true,
      notes: [],
      doc: {
        goal: "minimize",
        target_unit: "g/L",
        bounds: { pH: { lo: 6.5, hi: 9 } },
        linear_constraints: [{ coefficients: { glucose_gL: 1, glutamine_mM: 2 }, op: "<=", rhs: 15 }],
      },
    });
  });

  it("fills a blank end from the observed range (the engine needs both) and says so", () => {
    const r = buildSetupDoc(draft({ bounds: { pH: { lo: "", hi: "7" } } }), inputs);
    expect(r.ok && r.doc.bounds.pH).toEqual({ lo: 6.005, hi: 7 });
    expect(r.ok && r.notes[0]).toMatch(/observed low \(6\.005\) is used/);
  });

  it("refuses what the engine would refuse, next to the field", () => {
    const r = buildSetupDoc(
      draft({
        unit: "x".repeat(40),
        bounds: { pH: { lo: "8", hi: "7" }, glucose_gL: { lo: "20", hi: "30" }, unknown_range: { lo: "1", hi: "" }, glutamine_mM: { lo: "a", hi: "2" } },
        constraints: [
          { key: 1, terms: [{ feature: "pH", coef: "0" }], op: "<=", rhs: "1" },
          { key: 2, terms: [{ feature: "pH", coef: "1" }, { feature: "pH", coef: "1" }], op: "<=", rhs: "1" },
          { key: 3, terms: [{ feature: "pH", coef: "1" }], op: ">=", rhs: "" },
          { key: 4, terms: [{ feature: "", coef: "" }], op: "<=", rhs: "" },
        ],
      }),
      inputs,
    );
    expect(r.ok).toBe(false);
    const by = Object.fromEntries((!r.ok ? r.issues : []).map((i) => [i.field, i.message]));
    expect(by.unit).toMatch(/32/);
    expect(by["bound:pH"]).toMatch(/low must be below the high/);
    expect(by["bound:glucose_gL"]).toMatch(/does not overlap the observed 2\.004 to 11\.956/);
    expect(by["bound:unknown_range"]).toMatch(/both a low and a high/);
    expect(by["bound:glutamine_mM"]).toMatch(/numbers only/);
    expect(by["constraint:0"]).toMatch(/must not be zero/);
    expect(by["constraint:1"]).toMatch(/appears twice/);
    expect(by["constraint:2"]).toMatch(/right-hand side/);
    // An untouched constraint row is ignored, not an error.
    expect(by["constraint:3"]).toBeUndefined();
  });

  it("leaves out a stored bound on a column that is not an input, with a note", () => {
    const r = buildSetupDoc(draft({ bounds: { run_id: { lo: "1", hi: "2" } } }), inputs);
    expect(r.ok && r.doc.bounds).toEqual({});
    expect(r.ok && r.notes[0]).toMatch(/run_id is not a numeric input/);
  });
});

describe("draftFromSetup, sameSetup and constraintText", () => {
  it("round-trips the engine's stored setup", () => {
    const view = outOfSync as unknown as SetupView;
    const d = draftFromSetup(view.setup);
    expect(d).toMatchObject({ goal: "minimize", unit: "g/L", bounds: { pH: { lo: "6.5", hi: "9" } } });
    const back = buildSetupDoc(d, inputs);
    expect(back.ok && sameSetup(back.doc, view.setup)).toBe(true);
  });
  it("echoes a constraint with the user's own numbers and a real minus", () => {
    expect(constraintText({ coefficients: { glucose_gL: 1, glycerol: -0.5 }, op: "<=", rhs: 12 })).toBe("1 × glucose_gL \u2212 0.5 × glycerol ≤ 12");
    expect(constraintText({ coefficients: { a: -2 }, op: ">=", rhs: -1 })).toBe("\u22122 × a ≥ \u22121");
  });
});

describe("setupErrorCopy (the engine's 400 codes in plain words)", () => {
  it("never puts the raw code in the message, and keeps it for the disclosure", () => {
    const err = new EngineError(400, "constraints_with_categoricals", undefined, "this campaign's design has categorical features, ...");
    const c = setupErrorCopy(err);
    expect(c.message).toMatch(/categorical input/);
    expect(c.message).not.toMatch(/constraints_with_categoricals/);
    expect(c.fix).toMatch(/Remove the linear constraints/);
    expect(c).toMatchObject({ code: "constraints_with_categoricals", detail: "this campaign's design has categorical features, ..." });
  });
  it.each(["infeasible_constraints", "degenerate_constraints", "bounds_outside_data", "unknown_feature", "categorical_feature", "target_not_a_feature", "invalid_bounds", "invalid_setup", "invalid_body", "feasibility_unverified", "setup_too_large", "campaign_archived"])(
    "%s has plain copy and a fix",
    (code) => {
      const c = setupErrorCopy(new EngineError(400, code));
      expect(c.message.length).toBeGreaterThan(10);
      expect(c.message).not.toContain(code);
      expect(c.fix).toBeTruthy();
    },
  );
  it("falls back to the engine's sentence for an unknown code", () => {
    expect(setupErrorCopy(new EngineError(400, "brand_new", undefined, "Something new went wrong.")).message).toBe("Something new went wrong.");
  });
});

describe("describeAppliedSetup", () => {
  it("reads the engine's refused setup: reason, fix and warnings in plain words", () => {
    const v = describeAppliedSetup(refused.setup as unknown as AppliedSetup);
    expect(v.status).toBe("refused");
    expect(v.goal).toBe("minimize");
    expect(v.refusal?.title).toMatch(/categorical input/);
    expect(v.refusal?.reason).toMatch(/optimizer does not support linear constraints/);
    expect(v.refusal?.fix).toMatch(/remove the linear constraints/);
    expect(v.warnings.map((w) => w.code)).toEqual(["gp_shapes_swept_at_highest_run", "bound_extrapolates"]);
    expect(v.warnings[1].text).toMatch(/bound on pH reaches past your data/);
    expect(v.warnings[0].text).not.toMatch(/gp_shapes/);
    expect(v.dropped).toBe(0);
  });
  it("reads applied bounds with their extrapolation flag", () => {
    const v = describeAppliedSetup({
      status: "applied",
      goal: "maximize",
      bounds_applied: { pH: { requested: [6.5, 9], observed: [6.005, 7.594], applied: [6.5, 7.594], extrapolates: true } },
      constraints_applied: [],
      warnings: [],
      refusal: null,
      n_proposals_dropped: 2,
    });
    expect(v.bounds).toEqual([{ feature: "pH", requested: [6.5, 9], observed: [6.005, 7.594], applied: [6.5, 7.594], extrapolates: true }]);
    expect(v.dropped).toBe(2);
    expect(v.refusal).toBeNull();
  });
});

describe("setupSync and setupInputsFromAnalysis", () => {
  it("says a changed setup needs a re-analysis, or a re-upload when nothing is measured", () => {
    const view = outOfSync as unknown as SetupView;
    expect(setupSync(view, 2)).toEqual({ kind: "reanalyze" });
    expect(setupSync(view, 0)).toEqual({ kind: "reupload" });
    expect(setupSync({ ...view, settings_in_sync: true }, 0)).toEqual({ kind: "in-sync" });
    expect(setupSync({ ...view, has_analysis: false, settings_in_sync: null }, 0)).toEqual({ kind: "no-analysis" });
  });
  it("offers continuous inputs only, with the engine's observed and effective ranges", () => {
    const view = outOfSync as unknown as SetupView;
    const out = setupInputsFromAnalysis(
      { features: ["pH", "glucose_gL", "medium_base"], categorical_features: ["medium_base"], feature_ranges: { pH: [6.005, 7.594], glucose_gL: [2.004, 11.956] }, target: "titer_g_L" },
      view,
    );
    expect(out).toEqual([
      { name: "pH", observed: [6.005, 7.594], effective: [6.5, 7.594], extrapolates: true },
      { name: "glucose_gL", observed: [2.004, 11.956], effective: null, extrapolates: null },
    ]);
  });
});

describe("setupErrorCopy uses the engine's what_would_fix_it when sent", () => {
  it("prefers the engine fix over the app's fallback copy", async () => {
    const { setupErrorCopy } = await import("@/components/setup/setup-logic");
    const { EngineError } = await import("@/lib/engine-error");
    const err = new EngineError(400, "bounds_outside_data", undefined, "bounds entry 1 does not overlap", "set a range that overlaps the observed range");
    expect(setupErrorCopy(err).fix).toBe("set a range that overlaps the observed range");
    expect(setupErrorCopy(new EngineError(400, "bounds_outside_data")).fix).toMatch(/overlaps the observed low and high/);
  });
});
