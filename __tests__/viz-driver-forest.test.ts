import { describe, expect, it } from "vitest";
import type { Driver } from "@/lib/api";
import {
  describeDriverForest,
  driverForestTable,
  driverStatus,
  emptyDriversText,
  fdrShortName,
  forestSelectionNote,
  shapeWord,
  sourceFooter,
  toDriverForest,
} from "@/lib/viz-data/driver-forest";

const drv = (name: string, rho: number, ci: [number, number], significant: boolean, extra: Partial<Driver> = {}): Driver => ({ name, rho, ci95: ci, significant, ...extra });

// Shaped like the live E2E campaign: two significant, one failing FDR, one whose CI spans zero.
const drivers: Driver[] = [
  drv("pH", 0.172, [0.011, 0.345], false, { p: 0.0268, ci_excludes_zero: true, survives_fdr: false }),
  drv("temperature_C", 0.333, [0.199, 0.465], true, { p: 1.3e-5, ci_excludes_zero: true, survives_fdr: true }),
  drv("feed_rate_mLh", 0.112, [-0.049, 0.286], false, { p: 0.152, ci_excludes_zero: false, survives_fdr: false }),
  drv("osmolality_mOsm", -0.21, [-0.35, -0.03], true, { p: 0.0069, ci_excludes_zero: true, survives_fdr: true }),
];
const selection = { n_tested: 10, n_reported: 4, top_k: 8, fdr_method: "benjamini_hochberg", fdr_q: 0.05, n_bootstrap: 200, ranked_by: "abs_rho", unit: "recipe", n_units: 165, n_rows: 165 };

describe("toDriverForest", () => {
  it("ranks by |rho| and copies the engine's significance verdict untouched", () => {
    const f = toDriverForest({ drivers, driver_selection: selection });
    expect(f.drivers.map((d) => d.name)).toEqual(["temperature_C", "osmolality_mOsm", "pH", "feed_rate_mLh"]);
    expect(f.drivers.map((d) => d.significant)).toEqual([true, true, false, false]);
    expect(f.drivers[0].index).toBe(1);
  });

  it("never re-derives significance from the CI (a CI excluding 0 that fails FDR stays not significant)", () => {
    const f = toDriverForest({ drivers: [drv("x", 0.5, [0.3, 0.7], false, { ci_excludes_zero: true, survives_fdr: false })] });
    expect(f.drivers[0].significant).toBe(false);
    expect(driverStatus(f.drivers[0])).toBe("fails FDR");
  });

  it("keeps rows without a CI out of the forest (no bar without its interval)", () => {
    const bad = { name: "q", rho: 0.2, ci95: null, significant: false } as unknown as Driver;
    expect(toDriverForest({ drivers: [bad, drivers[0]] }).drivers.map((d) => d.name)).toEqual(["pH"]);
  });

  it("reads the shape column as not scored with the engine's reason verbatim", () => {
    const f = toDriverForest({ drivers, gp_shapes: { available: false, reason: "posterior sweep failed: RuntimeError", features: [], unmodeled: [] } });
    expect(f.shapes).toEqual({ kind: "not-scored", reason: "posterior sweep failed: RuntimeError" });
  });

  it("is absent when the engine sent no gp_shapes", () => {
    expect(toDriverForest({ drivers }).shapes).toEqual({ kind: "absent" });
  });

  it("maps shapes by name and lists missed-by-Spearman inputs that have no forest row", () => {
    const f = toDriverForest({
      drivers,
      gp_shapes: {
        available: true,
        reason: null,
        features: [
          { name: "pH", relevance: 0.83, shape: "interior_optimum", optimum_at: 7.05, peak_gain: 0.2, missed_by_spearman: false },
          { name: "DO_pct", relevance: 0.4, shape: "interior_optimum", optimum_at: 41, peak_gain: null, missed_by_spearman: true },
        ],
        unmodeled: ["causation"],
      },
    });
    expect(f.shapes.kind).toBe("ready");
    if (f.shapes.kind === "ready") expect(shapeWord(f.shapes.shapes.pH)).toBe("optimum 7.05");
    expect(f.missedOnly).toEqual(["DO_pct"]);
    expect(f.shapeCaveats).toEqual(["causation"]);
  });
});

describe("driverStatus", () => {
  it("names the failed test from the engine's own flags", () => {
    expect(driverStatus({ significant: true, excludesZero: true, survivesFdr: true }, "BH")).toBe("significant (BH)");
    expect(driverStatus({ significant: false, excludesZero: false, survivesFdr: false })).toBe("CI spans 0");
    expect(driverStatus({ significant: false, excludesZero: true, survivesFdr: false })).toBe("fails FDR");
  });
  it("says only 'not significant' when an older engine omits the flags", () => {
    expect(driverStatus({ significant: false, excludesZero: null, survivesFdr: null })).toBe("not significant");
  });
});

describe("selection note and footer", () => {
  it("states what was tested, the ranking, the FDR method and the unit", () => {
    expect(forestSelectionNote(selection)).toBe("10 inputs tested, 4 shown, ranked by |ρ| (BH FDR, q = 0.05), per recipe (165 recipes, 165 rows).");
  });
  it("is null when driver_selection is absent (absent rule)", () => {
    expect(forestSelectionNote(undefined)).toBeNull();
  });
  it("shortens known FDR methods and passes others through", () => {
    expect(fdrShortName("benjamini_hochberg")).toBe("BH");
    expect(fdrShortName("holm")).toBe("holm");
  });
  it("builds the one footer line", () => {
    expect(sourceFooter({ label: "Analysis of a.csv", engineVersion: "0.1.0", method: "Spearman ρ, bootstrap CI" }, { value: 165, word: "recipe" })).toBe(
      "From: Analysis of a.csv · n = 165 recipes · Spearman ρ, bootstrap CI · engine 0.1.0",
    );
    expect(sourceFooter({ label: "Engine analysis" })).toBe("From: Engine analysis · engine n/a");
  });
});

describe("describeDriverForest and the Data table", () => {
  const f = toDriverForest({ drivers, driver_selection: selection, gp_shapes: { available: false, reason: "posterior sweep failed", features: [] } });
  it("describes the verdict with the engine's 95% CI and uses U+2212 minus", () => {
    const s = describeDriverForest(f, "titer");
    expect(s).toContain("95% CI");
    expect(s).toContain("2 significant after FDR control: temperature_C ρ 0.33 [0.20, 0.47] 95% CI; osmolality_mOsm ρ \u22120.21 [\u22120.35, \u22120.03] 95% CI.");
    expect(s).toContain("feed_rate_mLh 0.11 (CI spans 0)");
    expect(s).toContain("Model shapes not scored: posterior sweep failed.");
  });
  it("tabulates every plotted value with 2 dp correlations", () => {
    const t = driverForestTable(f);
    expect(t.columns).toEqual(["Input", "ρ", "95% CI", "p", "Verdict"]);
    expect(t.rows[0]).toEqual(["temperature_C", "0.33", "[0.20, 0.47]", "<0.001", "significant (BH)"]);
    expect(t.rows[3][4]).toBe("CI spans 0");
  });
  it("says how many were tested when no driver came back", () => {
    expect(emptyDriversText({ nTested: 8 })).toBe("No input showed a rank association with the target (8 tested).");
    expect(emptyDriversText({ nTested: null })).toBe("This analysis reported no drivers.");
  });
});
