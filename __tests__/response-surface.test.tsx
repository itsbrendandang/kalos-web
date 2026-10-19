// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import mock from "./fixtures/plan-response-surface.json";
import { ResponseSurface2D } from "@/components/campaign/plan/response-surface";

afterEach(cleanup);

const surface = mock.response_surface;
const proposals = mock.proposals;

/** The plot's own svg (the legend has its own small marks). */
function plot(container: HTMLElement) {
  return container.querySelector('svg[viewBox="0 0 420 340"]') as SVGSVGElement;
}

function cells(container: HTMLElement) {
  return Array.from(container.querySelectorAll<SVGRectElement>("rect.surface-cell"));
}

describe("ResponseSurface2D", () => {
  it("renders nothing for an absent or malformed surface, without throwing", () => {
    for (const raw of [undefined, null, "x", { x_feature: "a" }, { ...surface, z: [[1]] }]) {
      const { container, unmount } = render(<ResponseSurface2D surface={raw} target="titer" />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });

  it("says it shows the predicted mean only and that uncertainty is not shown", () => {
    render(<ResponseSurface2D surface={surface} target="titer (g/L)" proposals={proposals} />);
    expect(screen.getByText("Predicted mean only, uncertainty not shown. Other inputs held at the incumbent recipe.")).toBeTruthy();
    expect(screen.getByText("Predicted mean only: uncertainty is not shown.", { exact: false })).toBeTruthy();
  });

  it("draws one cell per grid point, sized from the payload (5 x 4 here, not 21 x 21)", () => {
    const { container } = render(<ResponseSurface2D surface={surface} target="titer" />);
    expect(cells(container)).toHaveLength(20);
  });

  it("draws 21 x 21 when the engine sends that grid", () => {
    const vals = Array.from({ length: 21 }, (_, i) => i);
    const big = { x_feature: "A (u)", y_feature: "B", x_vals: vals, y_vals: vals, z: vals.map((y) => vals.map((x) => x + y)), runs: [] };
    const { container } = render(<ResponseSurface2D surface={big} target="titer" />);
    expect(cells(container)).toHaveLength(441);
  });

  it("has one tab stop, on the peak cell, and moves focus with the arrow keys", () => {
    const { container } = render(<ResponseSurface2D surface={surface} target="titer" />);
    const tabStops = cells(container).filter((c) => c.getAttribute("tabindex") === "0");
    expect(tabStops).toHaveLength(1);
    // The peak of the mock grid is row 2 (pH 7.0), column 4 (Temperature 50).
    expect(tabStops[0].getAttribute("aria-label")).toContain("Temperature (C) 50.00, pH 7.00");

    const group = container.querySelector('g[role="group"]') as Element;
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    const moved = cells(container).find((c) => c.getAttribute("tabindex") === "0")!;
    expect(moved.getAttribute("aria-label")).toContain("Temperature (C) 45.00, pH 7.00");
    expect(container.querySelector("p[aria-hidden]")?.textContent).toContain("Temperature (C) 45.00, pH 7.00: predicted mean");
  });

  it("keeps Home and End inside the grid and does not step past an edge", () => {
    const { container } = render(<ResponseSurface2D surface={surface} target="titer" />);
    const group = container.querySelector('g[role="group"]') as Element;
    fireEvent.keyDown(group, { key: "Home" });
    expect(cells(container).find((c) => c.getAttribute("tabindex") === "0")!.getAttribute("aria-label")).toContain("Temperature (C) 30.00");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(cells(container).find((c) => c.getAttribute("tabindex") === "0")!.getAttribute("aria-label")).toContain("Temperature (C) 30.00");
  });

  it("labels proposals P1..Pn inside the axes and says which lie outside", () => {
    const { container } = render(<ResponseSurface2D surface={surface} target="titer" proposals={proposals} />);
    const labels = Array.from(plot(container).querySelectorAll("text")).map((t) => t.textContent);
    expect(labels).toContain("P1");
    expect(labels).toContain("P2");
    expect(labels).not.toContain("P3");
    expect(screen.getByText(/1 proposed experiment lies outside the plotted range and is not drawn/)).toBeTruthy();
  });

  it("draws the measured runs as dots, separate from the proposal rings", () => {
    const { container } = render(<ResponseSurface2D surface={surface} target="titer" proposals={proposals} />);
    expect(plot(container).querySelectorAll('circle[fill="var(--chart-measured)"]')).toHaveLength(6);
    expect(plot(container).querySelectorAll('circle[stroke="var(--chart-predicted)"]')).toHaveLength(2);
  });

  it("carries the grid in a screen-reader table, rows highest y first", () => {
    const { container } = render(<ResponseSurface2D surface={surface} target="titer" />);
    const table = container.querySelector("table") as HTMLTableElement;
    expect(table.classList.contains("sr-only")).toBe(true);
    expect(table.querySelectorAll("tr")).toHaveLength(5); // 1 header + 4 y rows
    const firstBodyRow = table.querySelectorAll("tbody tr")[0];
    expect(firstBodyRow.querySelector("th")?.textContent).toBe("7.25");
    expect(firstBodyRow.querySelectorAll("td")).toHaveLength(5);
  });

  it("gives the marks their own text meaning and never draws a band", () => {
    const { container } = render(<ResponseSurface2D surface={surface} target="titer" proposals={proposals} />);
    expect(container.textContent).not.toMatch(/±|CI|interval/);
  });
});
