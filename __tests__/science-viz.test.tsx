import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { finitePairs, outcomeBins } from "@/lib/science-viz";
import { ProcessGuide } from "@/components/workbench/process-guide";
import { CalibrationChart, OutcomeDistribution, ProposalTradeoff } from "@/components/campaign/science-charts";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("measured-outcome display data", () => {
  it("never fabricates a distribution when no finite measurements exist", () => {
    expect(outcomeBins([])).toEqual([]);
    expect(outcomeBins([NaN, Infinity])).toEqual([]);
    expect(finitePairs([[1, 2], [2, NaN], [Infinity, 3]])).toEqual([[1, 2]]);
  });
  it("keeps constant and single measurements rather than inventing spread", () => {
    expect(outcomeBins([4])).toEqual([{ lo: 4, hi: 4, count: 1 }]);
    expect(outcomeBins([4, 4, 4])).toEqual([{ lo: 4, hi: 4, count: 3 }]);
  });
  it("counts each boundary and outlier exactly once without clipping the data", () => {
    const bins = outcomeBins([-10, 0, 1, 2, 2, 100]);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(6);
    expect(bins[0].lo).toBe(-10);
    expect(bins[bins.length - 1].hi).toBe(100);
    expect(bins[bins.length - 1].count).toBe(1);
  });
});

it("does not replace unavailable interval calibration or invalid proposals with synthetic points", () => {
  const calibration = renderToStaticMarkup(<TooltipProvider><CalibrationChart calibration={undefined} /></TooltipProvider>);
  expect(calibration).toContain("No calibration curve is inferred");
  expect(calibration).not.toContain('role="img"');
  const missingOutcomes = renderToStaticMarkup(<TooltipProvider><OutcomeDistribution target="yield" unit="g/L" /></TooltipProvider>);
  expect(missingOutcomes).toContain("Held-out measurements are not available");
  expect(missingOutcomes).not.toContain('role="img"');
  const proposals = renderToStaticMarkup(<TooltipProvider><ProposalTradeoff proposals={[{ pred: 10, std: -1, mode: "explore", vals: [], reason: "" }]} target="yield" unit="g/L" /></TooltipProvider>);
  expect(proposals).toContain("No proposals with a finite mean");
  expect(proposals).not.toContain('role="img"');
  expect(proposals).not.toContain("NaN");
});

describe("scientific process guides", () => {
  it.each(["/", "/data", "/library", "/library/scale-up", "/library/plate", "/library/vessels", "/library/simulator", "/campaign/setup", "/campaign/plan", "/campaign/run", "/campaign/record", "/campaign/learn", "/projects", "/projects/p-cho/report", "/settings/security"])("keeps the %s schematic distinct from engine status", (pathname) => {
    const html = renderToStaticMarkup(<ProcessGuide pathname={pathname} />);
    expect(html).toContain("Process guide · not live status");
    expect(html).toContain("Original explanatory schematics");
    expect(html).toContain("sartorius.com");
  });
  it("does not insert guides into sign-in or other authentication screens", () => {
    expect(renderToStaticMarkup(<ProcessGuide pathname="/sign-in" />)).toBe("");
  });
});
