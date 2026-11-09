import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("campaign home pilot scope", () => {
  it("does not put the pilot root on auth, library, or project routes", () => {
    for (const file of ["app/sign-in/page.tsx", "app/library/page.tsx", "app/projects/page.tsx", "app/campaign/plan/page.tsx", "app/campaign/learn/page.tsx"]) {
      expect(read(file), file).not.toContain("campaign-overview");
    }
  });

  it("keeps the calm summary to one metric, four facts, and one disclosure", () => {
    const summary = read("components/campaign/overview/summary-strip.tsx");
    expect(summary).toContain("Best measured");
    expect(summary).toContain("Campaign status");
    expect(summary).toContain("<summary");
    expect(summary).not.toContain("md:grid-cols-3");
    expect(summary).not.toContain("Baseline unavailable");
  });

  it("keeps the shared best-so-far chart on the accent card", () => {
    expect(read("components/campaign/best-so-far-chart.tsx")).not.toContain("overviewMeasured");
    expect(read("components/campaign/overview/stage-panel.tsx")).toContain("MeasuredTrend");
    expect(read("components/kit/chart-frame.tsx")).toContain("rounded-xl border border-border bg-surface p-5");
    expect(read("app/campaign/learn/page.tsx")).toContain("BestSoFarChart");
  });

  it("keeps new overview copy upright", () => {
    for (const file of [
      "components/campaign/overview/campaign-home.tsx",
      "components/campaign/overview/summary-strip.tsx",
      "components/campaign/overview/stage-panel.tsx",
      "components/campaign/overview/stage-tabs.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/italic|font-style:\s*italic/);
    }
  });
});
