// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CategoryFigure, CoverageFigure, DistributionFigure, ReplicateFigure, RunOrderFigure, TargetScatterFigure } from "@/components/campaign/data/figures";
import { histogram, replicateGroups, profileSheet, untestedGaps } from "@/components/campaign/data/profile";

afterEach(cleanup);

const label = (c: HTMLElement) => c.querySelector("svg")?.getAttribute("aria-label") ?? "";

describe("Your data figures", () => {
  it("draws one bar per histogram bin, sized by its run count", () => {
    const h = histogram([0, 0, 0, 5, 10], 2)!;
    const { container } = render(<DistributionFigure name="SP" hist={h} n={5} />);
    const bars = Array.from(container.querySelectorAll("rect[data-count]"));
    expect(bars.map((b) => Number(b.getAttribute("data-count")))).toEqual([3, 2]);
    expect(label(container)).toContain("Histogram of SP: 5 runs, 0 to 10");
  });

  it("draws one bar per category level, most common first, with its count", () => {
    const { container } = render(<CategoryFigure name="flag" levels={[{ value: "A", n: 3 }, { value: "B", n: 1 }]} />);
    expect(Array.from(container.querySelectorAll("rect[data-count]")).map((r) => r.getAttribute("data-count"))).toEqual(["3", "1"]);
    expect(label(container)).toBe("Bar chart of flag: A 3, B 1 runs.");
  });

  it("shades each untested stretch and says how many there are", () => {
    const values = [0, 1, 2, 8, 9, 10];
    const g = untestedGaps(values)!;
    const { container } = render(<CoverageFigure name="Gly" min={g.min} max={g.max} values={values} gaps={g.gaps} />);
    expect(container.querySelectorAll("rect[data-gap]")).toHaveLength(1);
    expect(label(container)).toBe("Coverage of Gly from 0 to 10: 6 distinct tested values, 1 untested stretch.");
  });

  it("plots one point per run with both values, and says so", () => {
    const points = [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 15 }];
    const { container } = render(<TargetScatterFigure xName="SP" yName="Titer" points={points} />);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(label(container)).toBe("Titer against SP: 3 runs with both values.");
  });

  it("places a category input as strips at each level in the order given", () => {
    const points = [{ x: "A", y: 1 }, { x: "B", y: 2 }, { x: "A", y: 3 }];
    const { container } = render(<TargetScatterFigure xName="flag" yName="Titer" points={points} levels={["A", "B"]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    const xs = Array.from(container.querySelectorAll("circle")).map((c) => Number(c.getAttribute("cx")));
    expect(xs[0]).toBe(xs[2]);
    expect(xs[0]).toBeLessThan(xs[1]);
  });

  it("joins the target in sheet order and leaves blank rows out of the line", () => {
    const { container } = render(<RunOrderFigure yName="Titer" values={[1, null, 3]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(container.querySelector("polyline")?.getAttribute("points")?.split(" ")).toHaveLength(2);
    expect(label(container)).toBe("Titer by row in the sheet: 2 values, 3 rows.");
  });

  it("draws every replicate value of the first groups, and caps the number shown", () => {
    const p = profileSheet("x,y\n1,10\n1,12\n2,20\n2,21\n3,30\n3,31\n4,40".split("\n").map((l) => l.split(",")));
    const groups = replicateGroups(p, new Set(), "y");
    const { container } = render(<ReplicateFigure yName="Titer" groups={groups} limit={2} />);
    expect(container.querySelectorAll("circle")).toHaveLength(4);
    expect(label(container)).toContain("3 replicate groups, 2 shown");
  });
});
