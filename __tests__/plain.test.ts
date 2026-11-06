import { describe, expect, it } from "vitest";
import { driverLine, trustPlain } from "@/lib/plain";
import type { Driver, ReliabilityVerdict } from "@/lib/api";

const v = (o: Partial<ReliabilityVerdict>) => ({ state: "reliable", label: "", rho: 0.54, ci: null, floor: null, caveat: null, reason: "", ...o }) as ReliabilityVerdict;
describe("trustPlain", () => {
  it("follows the engine's verdict and reuses its label and reason", () => {
    const good = trustPlain(v({ state: "reliable", label: "Reliable", reason: "above the floor" }));
    expect(good).toMatchObject({ level: "good", word: "Reliable", sentence: "above the floor" });
    expect(trustPlain(v({ state: "not-yet", label: "Not yet reliable", reason: "interval includes zero" }))).toMatchObject({ level: "warn", word: "Not yet reliable" });
    expect(trustPlain(v({ state: "insufficient", label: "Not enough runs to tell", rho: null }))).toMatchObject({ level: "none", word: "Not enough runs to tell" });
  });
  it("does not depend on a hard-coded cut-off", () => {
    expect(trustPlain(v({ rho: 0.95, state: "not-yet", label: "Not yet reliable" })).level).toBe("warn");
    expect(trustPlain(v({ rho: 0.3, state: "reliable", label: "Reliable" })).level).toBe("good");
  });
});
describe("driverLine", () => {
  const d = { name: "temperature_C", rho: 0.32, ci95: [0.1, 0.5], significant: true } as Driver;
  it("states direction, certainty and the sweet spot", () => {
    const l = driverLine(d, "titer", { shape: "interior_optimum", optimum_at: 35.84 });
    expect(l.sentence).toMatch(/higher titer/);
    expect(l.sentence).toMatch(/clear signal/i);
    expect(l.sentence).toMatch(/Best near 35.84/);
  });
  it("does not oversell a weak driver", () => expect(driverLine({ ...d, rho: -0.1, significant: false }, "titer").sentence).toMatch(/lower titer\. Not a clear signal/));
});

describe("flat, unclear drivers", () => {
  it("say there is no clear effect instead of a direction", () => {
    const d = { name: "agitation_rpm", rho: -0.14, ci95: [-0.26, 0.01], significant: false } as Driver;
    expect(driverLine(d, "titer", { shape: "flat", optimum_at: null }).sentence).toBe("No clear effect on titer in these runs.");
  });
});
