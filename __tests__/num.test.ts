import { describe, expect, it } from "vitest";
import {
  MINUS,
  atRangeEdge,
  columnDecimals,
  conformalInterval,
  formatCorr,
  formatDelta,
  formatP,
  formatProb,
  formatSetting,
  formatState,
  formatValue,
  formatVolume,
  parseUnit,
  precisionFromUncertainty,
  settingDecimals,
} from "@/lib/num";

const band = (value: number, u: number) => ({ lo: value - u, hi: value + u, coverage: 0.9, method: "conformal" as const });

describe("PDG rounding (VIZ_SPEC 2.2 required vectors)", () => {
  it.each([
    [4.2371, 0.6489, "4.2", "[3.6, 4.9]"],
    [4.2371, 0.312, "4.24", "[3.93, 4.55]"],
    [152.3, 23.7, "152", "[129, 176]"],
    [152.3, 48, "150", "[100, 200]"],
    [0.0123, 0.00098, "0.0123", "[0.0113, 0.0133]"],
    [-0.004, 0.31, "0.00", `[${MINUS}0.31, 0.31]`],
  ])("%s with band %s -> %s %s", (value, u, text, interval) => {
    const f = formatValue(value, { interval: band(value, u), basis: "predicted" });
    expect(f.value).toBe(text);
    expect(f.interval).toBe(interval);
    expect(f.coverage).toBe("90%");
  });

  it("no uncertainty: 3 significant figures, no interval", () => {
    const f = formatValue(4.2371);
    expect(f.value).toBe("4.24");
    expect(f.interval).toBeNull();
  });

  it("the exponent follows the 354 / 949 boundaries", () => {
    expect(precisionFromUncertainty(0.354)).toBe(-2);
    expect(precisionFromUncertainty(0.355)).toBe(-1);
    expect(precisionFromUncertainty(0.949)).toBe(-1);
    expect(precisionFromUncertainty(0.95)).toBe(-1); // rounds up to 1.0, 2 sf -> 1 decimal
    expect(() => precisionFromUncertainty(0)).toThrow();
  });

  it("an asymmetric interval takes its precision from the narrower side", () => {
    const f = formatValue(4.2371, { interval: { lo: 4.0, hi: 5.5, coverage: 0.9, method: "scale-ladder" } });
    expect(f.value).toBe("4.24"); // narrower side 0.2371 -> 2 sf of the error
  });

  it("missing coverage prints no percentage, never a guess", () => {
    const f = formatValue(4.2, { interval: { lo: 3.6, hi: 4.9, coverage: null, method: "conformal" } });
    expect(f.coverage).toBeNull();
    expect(f.text).not.toMatch(/%/);
  });

  it("text puts the unit after the center and the coverage last", () => {
    expect(formatValue(4.2371, { unit: "g/L", interval: band(4.2371, 0.6489) }).text).toBe("4.2\u00A0g/L [3.6, 4.9] 90%");
  });

  it("aria names the basis and the band", () => {
    expect(formatValue(4.2371, { basis: "predicted", unit: "g/L", interval: band(4.2371, 0.6489) }).aria).toBe("predicted 4.2 g/L, 90% held-out band 3.6 to 4.9");
  });

  it("missing values read n/a, never 0", () => {
    expect(formatValue(null).text).toBe("n/a");
    expect(formatValue(Number.NaN).text).toBe("n/a");
    expect(formatValue(undefined).state).toBe("na");
  });

  it("uses U+2212 for negatives and caps decimals; huge values group as integers", () => {
    expect(formatValue(-1.234).value).toBe(`${MINUS}1.23`);
    expect(formatValue(1234567.8).value).toBe("1,230,000"); // 3 sf, grouped, never 1.23e6
    expect(formatValue(0.00001234).value).toBe("<0.0001");
  });

  it("a forced decimal count wins (shared table column)", () => {
    expect(formatValue(4.2371, { decimals: 1 }).value).toBe("4.2");
  });
});

describe("states", () => {
  it("each state has one rendering", () => {
    expect(formatState({ kind: "na" }).text).toBe("n/a");
    expect(formatState({ kind: "not-scored", reason: "too few runs" }).text).toBe("Not scored");
    expect(formatState({ kind: "refused", reasons: ["x"] }).text).toBe("Refused");
    expect(formatState({ kind: "pending" }).text).toBe("Awaiting result");
    expect(formatState({ kind: "absent" }).text).toBe("");
  });
});

describe("quantities", () => {
  it("corr: 2 dp with its 95% CI", () => {
    expect(formatCorr(0.4212, [0.18, 0.611]).text).toBe("ρ 0.42 [0.18, 0.61] 95% CI");
    expect(formatCorr(-0.2, null).text).toBe(`ρ ${MINUS}0.20`);
    expect(formatCorr(null).text).toBe("n/a");
  });

  it("pct, prob and count", () => {
    expect(formatValue(0.9, { quantity: "pct" }).text).toBe("90%");
    expect(formatProb(0.004).text).toBe("<1%");
    expect(formatProb(0.996).text).toBe(">99%");
    expect(formatProb(0.784).text).toBe("78%");
    expect(formatValue(1204, { quantity: "count" }).text).toBe("1,204");
  });

  it("ratio: 2 sf and a ×", () => {
    expect(formatValue(12.3, { quantity: "ratio" }).text).toBe("12×");
    expect(formatValue(2.54, { quantity: "ratio" }).text).toBe("2.5×");
  });

  it("volume: SI unit, 3 sf, no scientific notation", () => {
    expect(formatVolume(0.25).text).toBe("250\u00A0mL");
    expect(formatVolume(0.000003).text).toBe("3\u00A0µL");
    expect(formatVolume(2000).text).toBe("2,000\u00A0L");
    expect(formatVolume(40000).text).toBe("40,000\u00A0L");
    expect(formatVolume(1.5).text).toBe("1.5\u00A0L");
  });

  it("p-values", () => {
    expect(formatP(0.0004).text).toBe("<0.001");
    expect(formatP(0.03214).text).toBe("0.032");
  });

  it("settings take their precision from the search range", () => {
    expect(settingDecimals([6.6, 7.6])).toBe(2);
    expect(settingDecimals([30, 40])).toBe(1);
    expect(settingDecimals([0, 400])).toBe(0);
    expect(formatSetting(6.9744, [6.0, 7.6]).value).toBe("6.97");
    expect(formatSetting(216.403, [100, 400]).value).toBe("216");
    expect(formatSetting(36.194, null).value).toBe("36.2");
    expect(atRangeEdge(7.59, [6.0, 7.6])).toBe(true);
    expect(atRangeEdge(7.0, [6.0, 7.6])).toBe(false);
  });

  it("a small non-zero setting never collapses to zero", () => {
    expect(formatSetting(0.0042, [0.001, 50]).value).toBe("0.0042");
    expect(formatSetting(-0.0042, [-50, 50]).value).toBe(`${MINUS}0.0042`);
    expect(formatSetting(0.6, [0, 1000]).value).toBe("0.60");
    expect(formatSetting(0.05, [0, 50]).value).toBe("0.050");
    expect(formatSetting(0.0042, null, null, 1).value).toBe("0.0042"); // even against a forced column precision
    expect(formatSetting(1e-9, [0, 1]).value).toBe("<0.000001");
    expect(formatValue(0.0042, { quantity: "setting" }).value).toBe("0.0042");
  });

  it("range precision is kept when it already shows 2 significant digits", () => {
    expect(formatSetting(0, [0, 50]).value).toBe("0.0");
    expect(formatSetting(5, [0, 1000]).value).toBe("5");
    expect(formatSetting(0.25, [0, 1]).value).toBe("0.25");
    expect(formatSetting(0.123, [0, 1]).value).toBe("0.12");
    expect(atRangeEdge(7.0, [6.0, 7.6])).toBe(false);
  });
});

describe("deltas", () => {
  it("signs, names no color, and offers a relative change only over a positive baseline", () => {
    const d = formatDelta(1.61, 1.422, { unit: "g/L" });
    expect(d.value).toBe("+0.19");
    expect(d.relative).toBe("+13%");
    expect(formatDelta(1, -2).relative).toBeNull();
    expect(formatDelta(1, 2, { relative: false }).relative).toBeNull();
    expect(formatDelta(null, 2).text).toBe("n/a");
  });
});

describe("helpers", () => {
  it("columnDecimals is the finest precision any row needs", () => {
    expect(columnDecimals([{ value: 4.2, u: 0.65 }, { value: 4.24, u: 0.31 }])).toBe(2);
    expect(columnDecimals([{ value: 152, u: 48 }])).toBe(0);
  });

  it("parseUnit reads only a trailing parenthesised unit", () => {
    expect(parseUnit("Titer (g/L)")).toEqual({ name: "Titer", unit: "g/L" });
    expect(parseUnit("titer_g_L")).toEqual({ name: "titer_g_L", unit: null });
  });

  it("conformalInterval is null without an engine band, and keeps the engine coverage", () => {
    expect(conformalInterval(1.75, null, 0.9)).toBeNull();
    expect(conformalInterval(1.75, 0.2, undefined)).toMatchObject({ lo: 1.55, hi: 1.95, coverage: null });
  });
});
