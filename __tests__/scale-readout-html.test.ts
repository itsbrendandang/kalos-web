// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { gateRefusal, parseReadoutDocument, readReasons } from "@/lib/scale-readout";

// Markup copied from real engine readouts (kalos-engine kalos/portal/scale_routes.py
// render_readout_html), trimmed to the sections the app reads.
const kv = (k: string, v: string, cls = "kv") => `<div class="${cls}"><span class="k">${k}</span><span class="v">${v}</span></div>`;

const NUMBER_PAGE = `<!doctype html><html><body>
<h1>Scale-Up Readout</h1><p class="timestamp">Generated 2026-11-19 03:50:04 UTC</p>
<div class="banner banner-number"><span class="banner-headline">Prediction issued</span><span class="banner-machine">NUMBER</span></div>
<h2>Prediction</h2>${kv("Predicted titer_g_per_L at 7500 L", "5.659")}${kv("Interval (approximate coverage) for titer_g_per_L at 7500 L", "[5.143, 6.176]")}
<h2>Target inputs</h2><div class="grid">${kv("Target scale", "7500 L")}${kv("ph_setpoint", "7")}</div>
<h2>Backtest ladder</h2><table><thead><tr><th>Scale</th><th>Step ratio</th><th>n</th><th>MAE</th><th>naive_mean MAE</th><th>naive_nn MAE</th><th>beats both</th></tr></thead>
<tbody><tr><td>10 L</td><td>3.33x</td><td>10</td><td>0.126</td><td>0.568</td><td>0.736</td><td>yes (below license window)</td></tr>
<tr><td>5000 L</td><td>1.67x</td><td>10</td><td>0.204</td><td>1.101</td><td>0.520</td><td>yes</td></tr></tbody></table>
<p class="muted">Skipped rungs:</p><ul class="skipped-reasons"><li>scale 3 L skipped: training set has 1 distinct scale(s) and 10 row(s); need at least 2 scales and 4 rows</li></ul>
<h2>Step ratio</h2>${kv("Reference (backtested) ratio", "3.33x")}${kv("Requested (target) ratio", "1.50x")}
<h2>Baseline comparison (pooled ladder residuals)</h2>${kv("Model MAE", "0.263")}${kv("naive_mean MAE", "0.699")}${kv("naive_nn MAE", "0.729")}${kv("beats both baselines", "yes")}${kv("pooled residuals (n)", "70")}
<h2>Provenance</h2><div class="grid">${kv("engine version", "0.1.0")}${kv("alpha", "0.1")}</div>${kv("raw upload SHA-256", "15673898b8c219b4f243cc7a413368cc2c5554fd999fbfe2c72160d64dc959cf", "kv kv-hash")}
<table class="const-table"><tbody><tr><td class="name">ALPHA</td><td class="value">0.1</td></tr></tbody></table>
</body></html>`;

const REFUSAL_PAGE = `<!doctype html><html><body>
<p class="timestamp">Generated 2026-11-19 03:50:15 UTC</p>
<div class="banner banner-refusal"><span class="banner-headline">No prediction: only 2 pooled ladder residual(s); need at least 10; no rung with at least 3 runs, within 1 decade(s) of the largest trained scale, beat both naive baselines to license a reference step ratio</span><span class="banner-machine">REFUSAL</span></div>
<div class="note note-info">Scale-only model: this sheet does not record agitation_rpm and airflow_L_per_min, so mixing and oxygen-transfer effects are not modeled.</div>
<h2>Target inputs</h2><div class="grid">${kv("Target scale", "50 L")}</div>
<h2>Backtest ladder</h2><table><thead><tr><th>Scale</th><th>Step ratio</th><th>n</th><th>MAE</th><th>naive_mean MAE</th><th>naive_nn MAE</th><th>beats both</th></tr></thead>
<tbody><tr><td>10 L</td><td>3.33x</td><td>2</td><td>0.300</td><td>0.500</td><td>0.600</td><td>too few to judge</td></tr></tbody></table>
<h2>Step ratio</h2>${kv("Reference (backtested) ratio", "n/a (no rung with at least 3 runs beat both baselines)")}${kv("Requested (target) ratio", "5.00x")}
<h2>What it would take</h2><ul class="data-plan"><li>8 more run(s) at any scale of 10 L or larger</li><li>at least 3 runs at a single scale of 10 L or larger whose backtest beats both baselines</li></ul>
</body></html>`;

const WARNING_PAGE = `<!doctype html><html><body>
<div class="banner banner-warning"><span class="banner-headline">Prediction issued with warnings</span><span class="banner-machine">NUMBER_WITH_WARNING</span></div>
<ul class="reasons"><li>process parameter(s) outside the trained range: ph_setpoint</li></ul>
<h2>Prediction</h2>${kv("Predicted titer_g_per_L at 40000 L", "4.1")}${kv("Interval (approximate coverage) for titer_g_per_L at 40000 L", "[3.2, 5.0]")}
<h2>Step ratio</h2>${kv("Reference (backtested) ratio", "3.33x")}${kv("Requested (target) ratio", "8.00x")}<p class="muted">Out-of-range process parameter(s): ph_setpoint</p>
</body></html>`;

const parse = (html: string) => parseReadoutDocument(new DOMParser().parseFromString(html, "text/html"));

describe("parseReadoutDocument", () => {
  it("reads a prediction: decision, value, interval with the engine's own label, ladder, baselines, provenance", () => {
    const s = parse(NUMBER_PAGE);
    expect(s.decision).toBe("NUMBER");
    expect(s.reasons).toEqual([]);
    expect(s.prediction).toEqual({
      label: "Predicted titer_g_per_L at 7500 L",
      value: "5.659",
      intervalLabel: "approximate coverage",
      low: "5.143",
      high: "6.176",
      intervalRaw: "[5.143, 6.176]",
    });
    expect(s.rungs).toHaveLength(2);
    expect(s.rungs[0]).toEqual({ scale: "10 L", stepRatio: "3.33x", n: "10", mae: "0.126", naiveMeanMae: "0.568", naiveNnMae: "0.736", beatsBoth: "yes (below license window)" });
    expect(s.skippedRungs).toHaveLength(1);
    expect(s.referenceRatio).toBe("3.33x");
    expect(s.requestedRatio).toBe("1.50x");
    expect(s.baseline).toEqual({ modelMae: "0.263", naiveMeanMae: "0.699", naiveNnMae: "0.729", beatsBoth: "yes", nResiduals: "70" });
    expect(s.dataPlan).toEqual([]);
    expect(s.generatedAt).toBe("2026-11-19 03:50:04 UTC");
    expect(s.engineVersion).toBe("0.1.0");
    expect(s.alpha).toBe("0.1");
    expect(s.uploadSha256).toMatch(/^15673898/);
  });

  it("reads a refusal as a normal outcome: every reason, no prediction, and the engine's 'What it would take' lines", () => {
    const s = parse(REFUSAL_PAGE);
    expect(s.decision).toBe("REFUSAL");
    expect(s.prediction).toBeNull();
    expect(s.reasons.map((r) => r.raw)).toEqual([
      "only 2 pooled ladder residual(s); need at least 10",
      "no rung with at least 3 runs, within 1 decade(s) of the largest trained scale, beat both naive baselines to license a reference step ratio",
    ]);
    expect(s.reasons[0].plain).toBe("Too few held-out runs to judge the model: 2 so far, and the engine needs at least 10.");
    expect(s.reasons[1].plain).toMatch(/^No tested scale with at least 3 runs, within a factor of 10 of your largest scale/);
    expect(s.dataPlan).toEqual([
      "8 more run(s) at any scale of 10 L or larger",
      "at least 3 runs at a single scale of 10 L or larger whose backtest beats both baselines",
    ]);
    expect(s.scaleOnlyNote).toMatch(/^Scale-only model/);
    expect(s.baseline).toBeNull();
    expect(s.rungs[0].beatsBoth).toBe("too few to judge");
    // A value the page does not carry is null, never invented.
    expect(s.engineVersion).toBeNull();
    expect(s.uploadSha256).toBeNull();
  });

  it("reads a warning: the warning lines and the out-of-range parameters", () => {
    const s = parse(WARNING_PAGE);
    expect(s.decision).toBe("NUMBER_WITH_WARNING");
    expect(s.reasons).toEqual([
      { plain: "Planned values outside the range run in your sheet: ph_setpoint.", raw: "process parameter(s) outside the trained range: ph_setpoint" },
    ]);
    expect(s.prediction?.value).toBe("4.1");
    expect(s.outOfRange).toBe("ph_setpoint");
  });

  it("returns no decision for a page it does not recognise, rather than guessing one", () => {
    const s = parse("<html><body><p>something else</p></body></html>");
    expect(s.decision).toBeNull();
    expect(s.prediction).toBeNull();
    expect(s.rungs).toEqual([]);
  });
});

describe("readReasons", () => {
  it("keeps every reason of a joined refusal, including the ratio rule, and an unknown sentence as written", () => {
    const r = readReasons("pooled ladder MAE does not beat both naive baselines; target ratio 12.00x exceeds 5x the reference step ratio 2.00x; a brand new rule");
    expect(r.map((x) => x.plain)).toEqual([
      "Across the whole backtest, the model did not beat both naive baselines.",
      "The step to the target (12.00x) is more than 5 times the largest step the backtest supports (2.00x).",
      "a brand new rule",
    ]);
  });
});

describe("gateRefusal", () => {
  it("names the missing column", () => {
    expect(gateRefusal("required_columns", "missing required column(s): ['scale_L']").statement).toMatch(/scale_L/);
  });

  it("reads the scale counts from the engine's detail", () => {
    const g = gateRefusal("min_distinct_scales", "only 2 distinct scale(s) present; need 1 more (at least 3 distinct scales total)");
    expect(g.statement).toBe("The sheet has runs at 2 distinct scales; the readout needs at least 3 to test itself on a scale ladder.");
    expect(g.fix).toEqual(["Runs at 1 more distinct scale."]);
  });

  it("states the hard cap only as the engine sent it", () => {
    const g = gateRefusal("target_ratio_hard_cap", "target scale-up ratio 25.00x exceeds the 20x hard cap");
    expect(g.statement).toMatch(/25\.00x; the limit is 20x/);
    expect(g.fix[0]).toMatch(/at most 20x/);
    expect(gateRefusal("target_ratio_hard_cap", "").statement).not.toMatch(/\d/);
  });

  it("has plain copy for every documented check and a fallback for an unknown one", () => {
    for (const check of ["non_finite_dropped_fraction", "target_not_interpolation", "invalid_target", "something_new"]) {
      const g = gateRefusal(check, "");
      expect(g.statement.length).toBeGreaterThan(10);
      expect(g.statement).not.toContain(check);
      expect(g.fix.length).toBeGreaterThan(0);
    }
  });
});
