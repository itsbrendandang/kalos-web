import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getColorClassName } from "@/components/tremor/chart-utils";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("campaign home pilot scope", () => {
  it("does not put the pilot root on auth, library, or project routes", () => {
    for (const file of ["app/sign-in/page.tsx", "app/library/page.tsx", "app/projects/page.tsx", "app/campaign/plan/page.tsx", "app/campaign/learn/page.tsx"]) {
      expect(read(file), file).not.toContain("campaign-overview");
    }
  });

  it("stacks the measured summary in one column below the md breakpoint", () => {
    const summary = read("components/campaign/overview/summary-strip.tsx");
    expect(summary).toContain("grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-3");
    expect(summary).toContain("grid-cols-1 gap-4 border-t border-overview-divider pt-4 md:grid-cols-2 xl:grid-cols-4");
    expect(summary).not.toContain("sm:grid-cols-2");
    expect(summary).not.toContain("col-span-2");
  });

  it("uses the pilot measured series only on the campaign home chart", () => {
    expect(getColorClassName("overviewMeasured", "stroke")).toBe("stroke-overview-measured");
    expect(getColorClassName("overviewMeasured", "fill")).toBe("fill-overview-measured");
    expect(getColorClassName("accent", "stroke")).toBe("stroke-accent");
    const home = read("components/campaign/overview/stage-panel.tsx");
    expect(home).toContain('series="measured"');
    expect(home).toContain('frame="rule"');
    const chart = read("components/campaign/best-so-far-chart.tsx");
    expect(chart).toContain('series = "accent"');
    expect(chart).toContain('frame = "card"');
    expect(chart).toContain('["overviewMeasured"]');
    expect(read("app/campaign/learn/page.tsx")).not.toContain("overviewMeasured");
    expect(read("components/kit/chart-frame.tsx")).toContain("rounded-xl border border-border bg-surface p-5");
    expect(read("components/kit/chart-frame.tsx")).toContain("border-t border-overview-divider pt-4");
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
