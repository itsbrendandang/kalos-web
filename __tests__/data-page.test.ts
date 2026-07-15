import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DATASET_COUNT, DATASETS, TOTAL_RUNS } from "@/app/data/page";

// Regression guard: the KPI ("Runs tracked") and the registry caption below the
// table must always agree, because both are derived from the same DATASETS
// array instead of one being a hand-typed literal.
describe("data-room dataset counts", () => {
  it("TOTAL_RUNS is the sum of DATASETS runs", () => {
    expect(TOTAL_RUNS).toBe(DATASETS.reduce((sum, d) => sum + d.runs, 0));
  });

  it("DATASET_COUNT is the length of DATASETS", () => {
    expect(DATASET_COUNT).toBe(DATASETS.length);
  });

  it("no stray hardcoded totals remain in the page source", () => {
    const src = readFileSync(path.resolve(__dirname, "../app/data/page.tsx"), "utf8");
    expect(src).not.toMatch(/\b166\b/);
    expect(src).not.toMatch(/\b192\b/);
  });

  it("no real internal dataset names leak into the demo registry", () => {
    const names = DATASETS.map((d) => d.name);
    expect(names).not.toContain("APR07");
    expect(names).not.toContain("APR29");
    expect(names).not.toContain("combined_APR");
  });
});
