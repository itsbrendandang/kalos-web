import { describe, expect, it } from "vitest";
import { buildGraph, circularMean, graphSentence, inputSentence, linkLine, NODE_R } from "@/lib/graph";
import type { PopulatedResult } from "@/lib/api";

const a = {
  target: "t", best: 2, n: 10, features: ["a", "b", "c"], proposal_features: ["a", "b"],
  drivers: [{ name: "a", rho: 0.4, ci95: [0, 1], significant: true }, { name: "b", rho: -0.1, ci95: [-1, 1], significant: false }],
  gp_shapes: { available: true, reason: null, swept_at: "x", n_features: 3, features: [
    { name: "a", relevance: 0.6, shape: "interior_optimum", optimum_at: 35.84, lengthscale: 1 },
    { name: "c", relevance: 0.1, shape: "flat", optimum_at: null, lengthscale: 1 } ] },
  proposals: [{ pred: 1, std: 0.1, mode: "explore", reason: "r", vals: [1, 2] }, { pred: 2, std: 0.1, mode: "exploit", reason: "r", vals: [1, 2] }],
} as unknown as PopulatedResult;

describe("buildGraph", () => {
  const g = buildGraph(a);
  it("has a target, every input and every proposal", () => {
    expect(g.nodes.filter((n) => n.kind === "target")).toHaveLength(1);
    expect(g.nodes.filter((n) => n.kind === "input")).toHaveLength(3);
    expect(g.nodes.filter((n) => n.kind === "proposal")).toHaveLength(2);
  });
  it("links an input to the target only when the engine reported something", () => {
    expect(g.edges.filter((e) => e.kind === "driver").map((e) => e.from).sort()).toEqual(["in:a", "in:b", "in:c"]);
  });
  it("links each proposal to the inputs it varies", () => {
    expect(g.edges.filter((e) => e.kind === "varies")).toHaveLength(4);
  });
  it("puts the most relevant input first", () => {
    expect(g.nodes.find((n) => n.kind === "input")!.label).toBe("a");
  });
  it("adds the two Library tools (no Vessels) and wires them to the result and the recipes", () => {
    expect(g.nodes.filter((n) => n.kind === "tool").map((n) => n.label).sort()).toEqual(["Benchmark", "Scale-up"]);
    expect(g.edges.filter((e) => e.from === "t:simulator")).toHaveLength(2);
    expect(g.nodes.some((n) => n.label === "Vessels")).toBe(false);
  });
  it("draws every input, recipe and tool at the same size; importance is distance from the hub", () => {
    const hub = g.nodes.find((n) => n.kind === "target")!;
    const inputs = g.nodes.filter((n) => n.kind === "input");
    for (const n of g.nodes) if (n.kind !== "target") expect(n.r).toBe(NODE_R);
    const dist = (n: { x: number; y: number }) => Math.hypot(n.x - hub.x, n.y - hub.y);
    const byName = Object.fromEntries(inputs.map((n) => [n.label, dist(n)]));
    expect(byName.a).toBeLessThan(byName.c);
    expect(byName.a).toBeLessThan(byName.b);
  });
  it("every edge points at a real node", () => {
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) { expect(ids.has(e.from)).toBe(true); expect(ids.has(e.to)).toBe(true); }
  });
});

describe("circularMean", () => {
  it("handles wrap-around", () => expect(Math.abs(circularMean([Math.PI - 0.1, -Math.PI + 0.1]))).toBeCloseTo(Math.PI, 5));
});

describe("graphSentence", () => {
  it("names the result, the best and the inputs that went most closely with it", () => {
    expect(graphSentence(a, buildGraph(a))).toBe("t: best measured 2 from 10 runs. a went most closely with it.");
  });
  it("says when every link could be chance", () => {
    const loose = { ...a, drivers: a.drivers.map((d) => ({ ...d, significant: false })) } as PopulatedResult;
    expect(graphSentence(loose, buildGraph(loose))).toMatch(/a and b went most closely with it, though every link could be chance\.$/);
  });
});

describe("inputSentence", () => {
  it("states the sweet spot, the direction in words and whether it is a clear signal; never the number", () => {
    const n = buildGraph(a).nodes.find((x) => x.id === "in:a")!;
    if (n.kind !== "input") throw new Error();
    expect(inputSentence(n)).toMatch(/Best near 35.84/);
    expect(inputSentence(n)).toMatch(/went with a higher result, somewhat\. Clear signal\./);
    expect(inputSentence(n)).not.toMatch(/0\.40|correlat|statistic/);
  });
});

describe("linkLine", () => {
  it("says direction, strength and chance in plain words", () => {
    expect(linkLine({ rho: 0.82, significant: true }, "Titer")).toBe("went with higher Titer strongly; clear signal");
    expect(linkLine({ rho: -0.3, significant: false }, "Titer")).toBe("went with lower Titer somewhat; could be chance");
    expect(linkLine({ rho: null, significant: false }, "Titer")).toBe("nothing reported about how it went with Titer");
  });
});
