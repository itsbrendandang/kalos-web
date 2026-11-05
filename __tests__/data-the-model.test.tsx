// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import engine from "./fixtures/engine-model-synthetic.json";
import { TheModel } from "@/components/campaign/data/the-model";
import type { PopulatedResult } from "@/lib/api";

// The held-out chart is recharts behind next/dynamic; the view's own wording and figures are what is under test.
vi.mock("@/components/kit/lazy-chart", () => ({ lazyChart: () => () => <div data-testid="pred-vs-measured" /> }));

afterEach(cleanup);

const analysis = { ...(engine as object), has_data: true, dataset: "pichia.csv", updated: 1, target: "Titer" } as unknown as PopulatedResult;

describe("TheModel", () => {
  it("states the engine's own reason as the verdict, with the trust word beside it", () => {
    render(<TheModel analysis={analysis} />);
    expect(screen.getByText(/ranks held-out runs above the trust floor/)).toBeTruthy();
    expect(screen.getByText("Reliable")).toBeTruthy();
    expect(screen.getByText("Can you trust its ranking?")).toBeTruthy();
  });

  it("labels the response slice, its held input, and the band as one posterior sd either side of the mean", () => {
    const { container } = render(<TheModel analysis={analysis} />);
    const svg = container.querySelector('svg[aria-label^="Model\'s predicted Titer against SP"]');
    expect(svg?.getAttribute("aria-label")).toContain("OD_OG held at 2.82");
    expect(svg?.getAttribute("aria-label")).toContain("one posterior standard deviation either side of the mean");
    expect(container.querySelector("polygon[data-band='sd']")).toBeTruthy();
    expect(screen.getByText(/Band: mean ± 1 posterior sd, at most ±/)).toBeTruthy();
  });

  it("lists every driver with its share and marks the shape a rank correlation misses", () => {
    render(<TheModel analysis={analysis} />);
    expect(screen.getByRole("img", { name: "OD_Prod: 50% of the model's relevance" })).toBeTruthy();
    expect(screen.getByText("A rank correlation would have missed this shape.")).toBeTruthy();
  });

  it("never prints a relevance share below half a percent as zero", () => {
    render(<TheModel analysis={analysis} />);
    expect(screen.getAllByText("under 1% of relevance").length).toBeGreaterThan(0);
    expect(screen.queryByText("0% of relevance")).toBeNull();
  });

  it("drops the band and says so when the engine sent no sd grid", () => {
    const noStd = { ...analysis, response_surface: { ...analysis.response_surface, std: undefined } } as unknown as PopulatedResult;
    const { container } = render(<TheModel analysis={noStd} />);
    expect(container.querySelector("polygon")).toBeNull();
    expect(container.querySelector('svg[aria-label*="No band"]')).toBeTruthy();
    expect(screen.queryByText(/Band: mean/)).toBeNull();
  });

  it("says plainly when the engine gave no shape reading or no surface", () => {
    const bare = { ...analysis, gp_shapes: undefined, response_surface: undefined } as unknown as PopulatedResult;
    render(<TheModel analysis={bare} />);
    expect(screen.getByText("The engine gave no shape reading for this sheet.")).toBeTruthy();
    expect(screen.getByText("The engine did not return a response surface for this sheet.")).toBeTruthy();
  });

  it("uses no regulated, outcome or uppercase wording", () => {
    const { container } = render(<TheModel analysis={analysis} />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const w of ["compliant", "validated", "design space", "signed", "tamper", "safe", "recommend", "stop", "continue"]) {
      expect(text).not.toContain(w);
    }
    expect(container.querySelector(".uppercase")).toBeNull();
  });
});
