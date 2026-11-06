// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CategoryFigure, CategoryStripFigure, CoverageFigure, DistributionFigure, ReplicateFigure, RunOrderFigure, TargetScatterFigure, jitter, shortLabel, yScale } from "@/components/campaign/data/figures";
import { histogram, replicateGroups, profileSheet, untestedGaps } from "@/components/campaign/data/profile";

afterEach(cleanup);

const label = (c: HTMLElement) => c.querySelector("svg[aria-label]")?.getAttribute("aria-label") ?? "";
const texts = (c: HTMLElement) => Array.from(c.querySelectorAll("text")).map((t) => t.textContent?.trim() ?? "");
const bestOf = (c: HTMLElement) => c.querySelector("[data-best]");

describe("yScale", () => {
  it("encloses the values in round ticks so the top and bottom of the plot are labelled", () => {
    const { ticks, y } = yScale([89, 2618], [100, 0]);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(3000);
    expect(y(0)).toBe(100);
    expect(y(3000)).toBe(0);
    expect(yScale([5, 5], [100, 0]).ticks).toEqual([5]);
    expect(yScale([21.86, 57.34], [100, 0]).ticks).toEqual([20, 40, 60]);
  });
});

describe("Your data figures", () => {
  it("draws one bar per histogram bin with its count above it, a runs axis and a tick at every edge", () => {
    const h = histogram([0, 0, 0, 5, 10], 2)!;
    const { container } = render(<DistributionFigure name="SP" hist={h} n={5} />);
    const bars = Array.from(container.querySelectorAll("rect[data-count]"));
    expect(bars.map((b) => Number(b.getAttribute("data-count")))).toEqual([3, 2]);
    const t = texts(container);
    expect(t).toContain("runs");
    expect(t).toContain("3");
    expect(t).toContain("2");
    for (const e of h.edges) expect(t).toContain(String(e));
    expect(label(container)).toBe("How many runs at each SP value: 5 runs in 2 equal ranges from 0 to 10; the most common range holds 3.");
  });

  it("skips the count label on an empty bin and labels every other edge when there are many", () => {
    const h = { edges: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], counts: [1, 0, 2, 0, 3, 0, 1, 0, 1, 2] };
    const { container } = render(<DistributionFigure name="SP" hist={h} n={10} />);
    const t = texts(container);
    expect(t.filter((s) => s === "0")).toHaveLength(2); // the runs-axis zero and the first edge, never an empty bin's count
    expect(t).toContain("10");
    expect(t).not.toContain("9");
  });

  it("draws one bar per category level, most common first, with its count at the end and a runs axis", () => {
    const { container } = render(<CategoryFigure name="flag" levels={[{ value: "A", n: 3 }, { value: "B", n: 1 }]} />);
    expect(Array.from(container.querySelectorAll("rect[data-count]")).map((r) => r.getAttribute("data-count"))).toEqual(["3", "1"]);
    expect(texts(container)).toEqual(expect.arrayContaining(["runs", "3", "1", "A", "B"]));
    expect(label(container)).toBe("Runs per level of flag: A 3, B 1 runs.");
  });

  it("shades each untested stretch and says how many there are", () => {
    const values = [0, 1, 2, 8, 9, 10];
    const g = untestedGaps(values)!;
    const { container } = render(<CoverageFigure name="Gly" min={g.min} max={g.max} values={values} gaps={g.gaps} />);
    expect(container.querySelectorAll("rect[data-gap]")).toHaveLength(1);
    expect(label(container)).toBe("Tested range of Gly from 0 to 10: 6 different values tried, 1 untested stretch.");
  });

  it("plots one dot per run with both values, rings the best with its value, and names both axes", () => {
    const points = [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 15 }];
    const { container } = render(<TargetScatterFigure xName="SP" yName="Titer" points={points} />);
    expect(container.querySelectorAll("circle.fill-chart-measured")).toHaveLength(3);
    expect(bestOf(container)?.getAttribute("data-best")).toBe("20");
    expect(bestOf(container)?.querySelector("circle")?.getAttribute("r")).toBe("6");
    expect(bestOf(container)?.textContent).toBe("best 20");
    const t = texts(container);
    expect(t).toContain("Titer");
    expect(t.some((s) => s.startsWith("SP") && s.includes("3 runs"))).toBe(true);
    expect(label(container)).toBe("Titer against SP: 3 runs with both values. Best 20 at SP 2.");
  });

  it("places a category input as strips sorted by median target, with the median tick, n per level and the best ringed", () => {
    const points = [
      { x: "A", y: 1, row: 0 },
      { x: "B", y: 2, row: 1 },
      { x: "A", y: 3, row: 2 },
      { x: "C", y: 9, row: 3 },
    ];
    const { container } = render(<CategoryStripFigure xName="flag" yName="Titer" points={points} />);
    expect(container.querySelectorAll("circle.fill-chart-measured")).toHaveLength(4);
    const medians = Array.from(container.querySelectorAll("[data-median]")).map((l) => Number(l.getAttribute("data-median")));
    expect(medians).toEqual([9, 2, 2]);
    const t = texts(container);
    expect(t.slice(t.indexOf("C"))).toEqual(expect.arrayContaining(["C", "1 run", "A", "2 runs", "B"]));
    expect(t.indexOf("C")).toBeLessThan(t.indexOf("A"));
    expect(bestOf(container)?.textContent).toBe("best 9");
    expect(label(container)).toContain("4 runs across 3 levels, highest typical value first: C (typical 9, 1 run), A (typical 2, 2 runs), B (typical 2, 1 run)");
    // Jitter is a fixed function of the row, never random.
    expect(jitter(7)).toBe(jitter(7));
    expect(Math.abs(jitter(7))).toBeLessThanOrEqual(0.25);
    expect(shortLabel("D-161646 pH 4")).toBe("D-16164…");
  });

  it("grows the strip figure with the levels, scales it to fit its column and lets it scroll only when a level would get too narrow", () => {
    const points = Array.from({ length: 19 }, (_, i) => ({ x: `src_${i}`, y: i, row: i }));
    const { container } = render(<CategoryStripFigure xName="CarbonSource" yName="Titer" points={points} />);
    const svg = container.querySelector("svg")!;
    expect(Number(svg.getAttribute("viewBox")!.split(" ")[2])).toBeGreaterThan(320);
    expect(svg.style.minWidth).toBe(`${40 * 19 + 44 + 16}px`);
    expect(container.firstElementChild?.className).toContain("overflow-x-auto");
    expect(label(container)).toContain("src_18 (typical 18, 1 run)");
  });

  it("draws the target in sheet order as dots only, with the best ringed and the axis rows labelled", () => {
    const { container } = render(<RunOrderFigure yName="Titer" values={[1, null, 3]} />);
    expect(container.querySelectorAll("circle.fill-chart-measured")).toHaveLength(2);
    expect(container.querySelector("polyline")).toBeNull();
    expect(container.querySelector("path")).toBeNull();
    expect(bestOf(container)?.textContent).toBe("best 3");
    const t = texts(container);
    expect(t).toContain("row 1");
    expect(t).toContain("row 3");
    expect(t).toContain("Titer");
    expect(label(container)).toBe("Titer by row in the sheet: 2 values, 3 rows.");
  });

  it("brackets consecutive replicate blocks with their count and leaves scattered replicates unbracketed", () => {
    const p = profileSheet("x,y\n1,10\n1,12\n1,11\n2,20\n3,30\n2,21".split("\n").map((l) => l.split(",")));
    const groups = replicateGroups(p, new Set(), "y");
    const { container } = render(<RunOrderFigure yName="y" values={p.columns[1].numbers} groups={groups} />);
    const blocks = Array.from(container.querySelectorAll("[data-block]"));
    expect(blocks.map((b) => b.getAttribute("data-block"))).toEqual(["3"]);
    expect(blocks[0].textContent).toBe("x3");
  });

  it("splits the rows into one panel per origin, each titled with its label and n, on a shared y axis", () => {
    const { container } = render(<RunOrderFigure yName="y" values={[1, 2, 3, 4, 5]} origins={[null, null, null, "Round 1", "Round 1"]} />);
    const panels = Array.from(container.querySelectorAll("svg[aria-label]"));
    expect(panels).toHaveLength(2);
    expect(panels[0].getAttribute("aria-label")).toBe("sheet: 3 values of y, rows 1 to 3.");
    expect(panels[1].getAttribute("aria-label")).toBe("Round 1: 2 values of y, rows 4 to 5.");
    const t = texts(container);
    expect(t).toContain("sheet, 3 runs");
    expect(t).toContain("Round 1, 2 runs");
    expect(container.querySelectorAll("[data-best]")).toHaveLength(1);
    expect(panels[1].querySelector("[data-best]")).toBeTruthy();
  });

  it("draws every replicate value of the highest-median groups first, labels each x{k}, rings the best, and caps the number shown", () => {
    const p = profileSheet("x,y\n1,10\n1,12\n2,20\n2,21\n3,30\n3,31\n4,40".split("\n").map((l) => l.split(",")));
    const groups = replicateGroups(p, new Set(), "y");
    const { container } = render(<ReplicateFigure yName="Titer" groups={groups} limit={2} />);
    expect(container.querySelectorAll("circle.fill-chart-measured")).toHaveLength(4);
    const ys = Array.from(container.querySelectorAll("circle.fill-chart-measured")).map((c) => Number(c.getAttribute("cy")));
    expect(Math.min(...ys.slice(0, 2))).toBeLessThan(Math.min(...ys.slice(2))); // the 30/31 group sits left of the 20/21 group
    expect(texts(container).filter((s) => s === "x2")).toHaveLength(2);
    expect(bestOf(container)?.textContent).toBe("best 31");
    expect(label(container)).toContain("3 recipes run more than once, 2 shown, highest typical value first");
  });
});
