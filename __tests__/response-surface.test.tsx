// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import mock from "./fixtures/plan-response-surface.json";
import { ResponseSurface2D } from "@/components/campaign/plan/response-surface";

afterEach(cleanup);

const surface = { ...mock.response_surface, fixed_recipe: { ...mock.response_surface.fixed_recipe, "Temperature (C)": 41, pH: 6.9 } };
const proposals = mock.proposals;
const W = 900;
const withSd = { ...surface, std: surface.z.map((r) => r.map((_, j) => 0.1 + j * 0.05)) };

const panels = (c: HTMLElement) => Array.from(c.querySelectorAll<SVGSVGElement>('svg[role="group"]'));

describe("ResponseSurface2D (C5 SurfacePair)", () => {
  it("renders nothing for an absent or malformed surface, without throwing", () => {
    for (const raw of [undefined, null, "x", { x_feature: "a" }, { ...surface, z: [[1]] }]) {
      const { container, unmount } = render(<ResponseSurface2D surface={raw} target="titer" width={W} />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });

  it("shows the engine's reason as Not scored when it declined to compute the surface", () => {
    render(<ResponseSurface2D surface={undefined} target="titer" reason="fewer than 2 continuous drivers" width={W} />);
    expect(screen.getByText("fewer than 2 continuous drivers")).toBeTruthy();
    expect(screen.getByText(/Not scored/)).toBeTruthy();
  });

  it("titles the chart 'Model-predicted' and states what the other inputs are held at", () => {
    render(<ResponseSurface2D surface={surface} target="titer (g/L)" proposals={proposals} width={W} />);
    expect(screen.getByText("Model-predicted titer (g/L) across Temperature (C) and pH")).toBeTruthy();
    expect(screen.getByText("Other inputs held at the incumbent recipe (best single run): Feed rate (mL/h) 1.25, Strain K12.")).toBeTruthy();
  });

  it("without std: one full-width mean panel and the not-scored note, no sigma map", () => {
    const { container } = render(<ResponseSurface2D surface={surface} target="titer" width={W} />);
    expect(panels(container)).toHaveLength(1);
    expect(panels(container)[0].getAttribute("width")).toBe(String(W));
    expect(screen.getByText("Uncertainty map not returned by this engine build.")).toBeTruthy();
    expect(container.innerHTML).not.toContain("--chart-unc-");
  });

  it("with the engine's std: a mean and a sigma panel side by side, sigma on the grey ramp", () => {
    const { container } = render(<ResponseSurface2D surface={withSd} target="titer" width={W} />);
    expect(panels(container)).toHaveLength(2);
    expect(container.innerHTML).toContain("var(--chart-unc-");
    expect(screen.queryByText("Uncertainty map not returned by this engine build.")).toBeNull();
  });

  it("fills contour bands from the violet ramp with surface-coloured isolines, never a hard-coded colour", () => {
    const { container } = render(<ResponseSurface2D surface={surface} target="titer" width={W} />);
    const bands = Array.from(container.querySelectorAll("path[fill^='var(--chart-seq-']"));
    expect(bands.length).toBeGreaterThan(0);
    expect(bands.every((b) => b.getAttribute("stroke") === "var(--surface)")).toBe(true);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}\b|rgb\(/i);
  });

  it("labels proposals P1..Pn inside the axes and says which lie outside", () => {
    const { container } = render(<ResponseSurface2D surface={surface} target="titer" proposals={proposals} width={W} />);
    const labels = Array.from(panels(container)[0].querySelectorAll("text")).map((t) => t.textContent);
    expect(labels).toContain("P1");
    expect(labels).toContain("P2");
    expect(labels).not.toContain("P3");
    expect(screen.getByText("P3 lies outside the plotted range and is not drawn.")).toBeTruthy();
  });

  it("draws measured runs as filled ink dots and proposals as hollow accent rings", () => {
    const { container } = render(<ResponseSurface2D surface={surface} target="titer" proposals={proposals} width={W} />);
    const svg = panels(container)[0];
    expect(svg.querySelectorAll('circle[fill="var(--chart-measured)"]')).toHaveLength(6);
    expect(svg.querySelectorAll('circle[stroke="var(--chart-predicted)"][fill="none"]')).toHaveLength(2);
    expect(screen.getAllByText(/projected: other inputs differ/).length).toBeGreaterThan(0);
  });

  it("links the crosshair across both panels and reads mean and sigma at the grid point", () => {
    const { container } = render(<ResponseSurface2D surface={withSd} target="titer (g/L)" width={W} />);
    const explorer = container.querySelector('rect[tabindex="0"][role="application"]') as Element;
    fireEvent.focus(explorer);
    // Starts at the incumbent's grid point (Temperature 40, pH 7.0).
    expect(container.textContent).toContain("at Temperature (C) 40.0, pH 7.000");
    fireEvent.keyDown(explorer, { key: "ArrowRight" });
    expect(container.textContent).toMatch(/predicted 43\.59\u00A0g\/L · σ 0\.25\u00A0g\/L at Temperature \(C\) 45\.0, pH 7\.000/);
    // Both panels draw the crosshair.
    const crosshairs = panels(container).map((s) => s.querySelectorAll('line[stroke="var(--fg)"]').length);
    expect(crosshairs).toEqual([2, 2]);
  });

  it("has a Data table of the grid and a source footer", () => {
    render(<ResponseSurface2D surface={surface} target="titer" width={W} source={{ label: "Analysis of a.csv", field: "response_surface", basis: "predicted", engineVersion: "0.1.0" }} />);
    expect(screen.getByText("Data")).toBeTruthy();
    expect(screen.getByText("From: Analysis of a.csv · n = 6 measured runs · engine 0.1.0")).toBeTruthy();
  });

  it("never prints a coverage percentage (the surface carries no interval)", () => {
    const { container } = render(<ResponseSurface2D surface={withSd} target="titer" proposals={proposals} width={W} />);
    expect(container.textContent).not.toMatch(/\d%/);
  });
});
