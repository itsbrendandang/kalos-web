import { describe, expect, it } from "vitest";
import { noiseNote, orientationNote, proposalBaseline, type NoiseReport } from "@/lib/api";

function noise(overrides: Partial<NoiseReport> = {}): NoiseReport {
  return {
    n_recipes: 10,
    n_replicated: 4,
    replicate_aware: true,
    icc: 0.62,
    noise_sd: 0.3,
    signal_sd: 0.5,
    best_single: 12.5,
    best_reproducible: 11.2,
    ...overrides,
  };
}

describe("proposalBaseline", () => {
  it("uses the reproducible best when the sheet has replicates", () => {
    expect(proposalBaseline({ best: 12.5, noise: noise() }, 13)).toEqual({ value: 11.2, kind: "reproducible" });
  });

  it("falls back to the measured best (campaign first) without replicates", () => {
    const unreplicated = noise({ n_replicated: 0, best_reproducible: null, icc: null });
    expect(proposalBaseline({ best: 12.5, noise: unreplicated }, 13)).toEqual({ value: 13, kind: "single" });
    expect(proposalBaseline({ best: 12.5, noise: unreplicated })).toEqual({ value: 12.5, kind: "single" });
  });

  it("falls back to the analysis best on an engine with no noise block", () => {
    expect(proposalBaseline({ best: 12.5, noise: undefined }, null)).toEqual({ value: 12.5, kind: "single" });
  });
});

describe("noiseNote", () => {
  it("names the reproducible best and the ICC", () => {
    expect(noiseNote(noise())).toBe("reproducible 11.20 · ICC 0.62 (4 of 10 recipes replicated)");
  });

  it("renders nothing when there is nothing measured to show", () => {
    expect(noiseNote(undefined)).toBeNull();
    expect(noiseNote(noise({ best_reproducible: null, icc: null }))).toBeNull();
  });
});

describe("orientationNote", () => {
  it("says nothing for a standard sheet or an absent report", () => {
    expect(orientationNote(null)).toBeNull();
    expect(orientationNote(undefined)).toBeNull();
    expect(orientationNote({ orientation: "standard", confidence: 0.9, signals: {} })).toBeNull();
  });

  it("discloses a transposed sheet that was normalized", () => {
    const note = orientationNote({ orientation: "transposed", confidence: 0.93, signals: {} });
    expect(note).toMatch(/transposed/);
    expect(note).toMatch(/0\.93/);
  });

  it("discloses an ambiguous sheet that was left untouched", () => {
    expect(orientationNote({ orientation: "ambiguous", confidence: 0.5, signals: {} })).toMatch(/as uploaded/);
  });
});
