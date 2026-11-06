// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import engine from "./fixtures/engine-model-synthetic.json";
import { TheModel } from "@/components/campaign/data/the-model";
import type { PopulatedResult } from "@/lib/api";

// The held-out chart is recharts behind next/dynamic; the view's own wording and figures are what is under test.
vi.mock("@/components/kit/lazy-chart", () => ({ lazyChart: () => () => <div data-testid="pred-vs-measured" /> }));

afterEach(cleanup);

/** Opens the disclosure whose summary holds `text` (jsdom does not toggle <details> on a click). */
function open(summary: HTMLElement) {
  const details = summary.closest("details")!;
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
}

const analysis = { ...(engine as object), has_data: true, dataset: "pichia.csv", updated: 1, target: "Titer" } as unknown as PopulatedResult;

describe("TheModel", () => {
  it("states a plain verdict with its why-line and the trust word beside it, and keeps the scoring numbers one click down", () => {
    render(<TheModel analysis={analysis} />);
    expect(screen.getByText("The model put past runs in the right order most of the time.")).toBeTruthy();
    expect(screen.getByText(/Why this matters: If the model puts your past runs in the right order/)).toBeTruthy();
    expect(screen.getByText("Reliable")).toBeTruthy();
    expect(screen.getByText("Can you trust its ranking?")).toBeTruthy();
    expect(screen.getByText("The likely range is wider than it needs to be.")).toBeTruthy();
    expect(screen.getByText(/Why this matters: If far more results land inside the likely range/)).toBeTruthy();
    expect(screen.queryByText(/held-out/)).toBeNull();
    open(screen.getByText("How the model was scored"));
    expect(screen.getByText(/^The model put your past runs in the right order most of the time/)).toBeTruthy();
    expect(screen.getByText(/Rank agreement \(Spearman\) on held-out runs: 0\.90/)).toBeTruthy();
    expect(screen.getByText(/Of held-out runs, 97% fell inside/)).toBeTruthy();
  });

  it("labels the predicted slice, its held input, and the shading as how sure the model is, in plain words", () => {
    const { container } = render(<TheModel analysis={analysis} />);
    const svg = container.querySelector('svg[aria-label^="Predicted Titer against SP"]');
    expect(svg?.getAttribute("aria-label")).toContain("OD_OG held at 2.82");
    expect(svg?.getAttribute("aria-label")).toContain("Shaded: how sure the model is at each point");
    expect(container.querySelector("polygon[data-band='sd']")).toBeTruthy();
    expect(screen.getByText(/Shaded: how sure the model is here, at most ±/)).toBeTruthy();
    expect(screen.queryByText(/posterior/)).toBeNull();
  });

  it("lists what the model leans on with each share and marks the shape a more-is-better reading misses", () => {
    render(<TheModel analysis={analysis} />);
    expect(screen.getByText("What the model leans on")).toBeTruthy();
    expect(screen.getByRole("img", { name: "OD_Prod: the model leans on it for 50%" })).toBeTruthy();
    expect(screen.getByText("Asking only whether more is better would have missed this shape.")).toBeTruthy();
  });

  it("never prints a share below half a percent as zero", () => {
    render(<TheModel analysis={analysis} />);
    expect(screen.getAllByText("under 1% of what the model leans on").length).toBeGreaterThan(0);
    expect(screen.queryByText("0% of what the model leans on")).toBeNull();
  });

  it("drops the band and says so when the engine sent no sd grid", () => {
    const noStd = { ...analysis, response_surface: { ...analysis.response_surface, std: undefined } } as unknown as PopulatedResult;
    const { container } = render(<TheModel analysis={noStd} />);
    expect(container.querySelector("polygon")).toBeNull();
    expect(container.querySelector('svg[aria-label*="No shading"]')).toBeTruthy();
    expect(screen.queryByText(/Shaded: how sure/)).toBeNull();
  });

  it("says plainly when the engine gave no shape reading or no surface", () => {
    const bare = { ...analysis, gp_shapes: undefined, response_surface: undefined } as unknown as PopulatedResult;
    render(<TheModel analysis={bare} />);
    expect(screen.getByText("Kalos gave no shape reading for this sheet.")).toBeTruthy();
    expect(screen.getByText("Predicted Titer across two inputs")).toBeTruthy();
    expect(screen.getByText("Kalos did not send predictions across two inputs for this sheet.")).toBeTruthy();
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
