import { describe, expect, it } from "vitest";
import { trustView } from "@/components/campaign/trust";
import type { EngineVerdict } from "@/lib/api";

const engine = (over: Partial<EngineVerdict> = {}): EngineVerdict => ({
  state: "reliable",
  code: "reliable",
  headline: "Kalos put your past runs in the right order.",
  reasons: [],
  ordering: { state: "ok", plain: "The model put past runs it had not seen in the right order most of the time." },
  range_width: { state: "too_narrow", code: "bands_narrow", plain: "The likely range is too narrow." },
  ...over,
});

const base = { cv_spearman: 0.5, cv_ci95: [0.3, 0.7] as [number, number] };

describe("trustView", () => {
  it("uses the engine's verdict when present, with its reasons one click down", () => {
    const v = trustView({ verdict: engine(), cv_spearman: 0.1, cv_ci95: [-0.2, 0.3] });
    expect(v).toMatchObject({ source: "engine", tone: "good", label: "Reliable", sentence: "Kalos put your past runs in the right order." });
    expect(v.details).toEqual(["The model put past runs it had not seen in the right order most of the time.", "The likely range is too narrow."]);
  });

  it("maps not_yet and refused to warn and bad", () => {
    expect(trustView({ ...base, verdict: engine({ state: "not_yet", reasons: [{ code: "few", plain: "Only 12 runs." }] }) })).toMatchObject({ tone: "warn", label: "Not yet reliable" });
    expect(trustView({ ...base, verdict: engine({ state: "refused" }) }).tone).toBe("bad");
  });

  it("drops duplicate and empty reasons", () => {
    const v = trustView({ ...base, verdict: engine({ reasons: [{ code: "a", plain: "Same." }, { code: "b", plain: "Same." }], ordering: null, range_width: { state: "ok", code: "ok", plain: "" } }) });
    expect(v.details).toEqual(["Same."]);
  });

  it("falls back to the derived verdict on older engines or a malformed one", () => {
    expect(trustView({ cv_spearman: 0.6, cv_ci95: [0.4, 0.8], reliability: { spearman: 0.6, ci95: [0.4, 0.8], spearman_floor: 0.2, clears_floor: true, ci_excludes_zero: true, unmodeled: [] } } as never).source).toBe("derived");
    expect(trustView({ ...base, verdict: { state: "weird" } as never }).source).toBe("derived");
  });
});
