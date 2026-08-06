// Regression tests for the Map tab's local-graph lens (DESIGN_SPEC.md section
// 5). The three things worth locking down are the ones a visual review cannot
// catch: that the depth slider really re-runs the BFS instead of hiding rings,
// that node radius encodes descendant count ONLY when that count exists, and
// that a directed edge stops on its target's rim so the arrowhead is visible.
import { describe, expect, it } from "vitest";
import { hopDistances, neighborhood } from "@/lib/workspace/graph/neighborhood";
import { LOCAL_GRAPH, NODE_GEOMETRY, radiusFromDescendants, shortenToRim } from "@/lib/workspace/graph/geometry";
import {
  descendantIndex,
  layoutLocalGraph,
  localRadius,
  ringAngles,
  ringRadius,
  runRootCandidates,
} from "@/lib/workspace/graph/local-graph";
import { evaluateQuery, parseQuery } from "@/lib/workspace/graph/graph-query";
import { DEFAULT_SETTINGS, fillPercent, mergeSettings, SLIDER_RANGE } from "@/lib/workspace/graph/graph-settings";
import type { LineageGraph, MapEdge, MapNode } from "@/lib/workspace/map-types";

function node(id: string, overrides: Partial<MapNode> = {}): MapNode {
  return {
    id,
    kind: "measured-run",
    round: 1,
    label: id,
    sublabel: null,
    value: null,
    band: null,
    recipe: null,
    mode: null,
    createdAtMs: null,
    measuredAtMs: null,
    provenance: null,
    x: 0,
    y: 0,
    fixed: false,
    ...overrides,
  };
}

function graphOf(nodes: MapNode[], edges: MapEdge[], instrumented?: Partial<LineageGraph["instrumented"]>): LineageGraph {
  return {
    nodes,
    edges,
    stubs: [],
    runCount: nodes.length,
    roundCount: 1,
    instrumented: { perRunLineage: true, sop: false, ...instrumented },
  };
}

/** A chain a -> b -> c -> d of run-level descent, plus one unrelated node. */
function chainGraph(): LineageGraph {
  const nodes = [node("a"), node("b"), node("c"), node("d"), node("island")];
  const edges: MapEdge[] = [
    { id: "e-ab", kind: "cross-round-descent", source: "a", target: "b" },
    { id: "e-bc", kind: "cross-round-descent", source: "b", target: "c" },
    { id: "e-cd", kind: "cross-round-descent", source: "c", target: "d" },
  ];
  return graphOf(nodes, edges);
}

describe("BFS depth limiting", () => {
  const graph = chainGraph();

  it("stops exactly at the requested hop count", () => {
    expect([...hopDistances("a", graph.edges, 1).keys()].sort()).toEqual(["a", "b"]);
    expect([...hopDistances("a", graph.edges, 2).keys()].sort()).toEqual(["a", "b", "c"]);
    expect([...hopDistances("a", graph.edges, 3).keys()].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("records the hop number, not just membership", () => {
    const hops = hopDistances("a", graph.edges, 3);
    expect(hops.get("a")).toBe(0);
    expect(hops.get("b")).toBe(1);
    expect(hops.get("d")).toBe(3);
  });

  it("never reaches an unconnected node, however deep", () => {
    expect(hopDistances("a", graph.edges, 99).has("island")).toBe(false);
  });

  it("depth 0 is the root alone, and neighborhood still agrees with it", () => {
    expect([...hopDistances("a", graph.edges, 0).keys()]).toEqual(["a"]);
    expect(neighborhood("a", graph.edges, 2)).toEqual(new Set(["a", "b", "c"]));
  });

  it("walks edges in both directions - descent is stored one way, read both", () => {
    expect([...hopDistances("d", graph.edges, 1).keys()].sort()).toEqual(["c", "d"]);
  });

  it("re-runs from the root when the depth changes, rather than hiding rings", () => {
    const index = descendantIndex(graph);
    const opts = {
      linkDistance: 120,
      clusterByRound: 0,
      nodeSize: 1,
      allowedIds: null,
      descendants: index,
      reserveRight: false,
    };
    const shallow = layoutLocalGraph(graph, "a", { ...opts, depth: 1 });
    const deep = layoutLocalGraph(graph, "a", { ...opts, depth: 3 });
    expect(shallow?.nodes.map((n) => n.node.id).sort()).toEqual(["a", "b"]);
    expect(deep?.nodes.map((n) => n.node.id).sort()).toEqual(["a", "b", "c", "d"]);
    // A node that moved from depth 2 to depth 1 would mean the rings were
    // being filtered rather than recomputed.
    expect(deep?.nodes.find((n) => n.node.id === "c")?.hop).toBe(2);
  });

  it("does not route through a node the filters removed", () => {
    const index = descendantIndex(graph);
    const layout = layoutLocalGraph(graph, "a", {
      depth: 3,
      linkDistance: 120,
      clusterByRound: 0,
      nodeSize: 1,
      allowedIds: new Set(["a", "c", "d"]),
      descendants: index,
      reserveRight: false,
    });
    expect(layout?.nodes.map((n) => n.node.id)).toEqual(["a"]);
  });
});

describe("node radius from descendant count", () => {
  it("follows the spec formula and caps at 14 descendants", () => {
    expect(radiusFromDescendants(0)).toBeCloseTo(7, 6);
    expect(radiusFromDescendants(5)).toBeCloseTo(10.1, 6);
    expect(radiusFromDescendants(14)).toBeCloseTo(15.68, 6);
    expect(radiusFromDescendants(400)).toBeCloseTo(radiusFromDescendants(14), 6);
  });

  it("counts descendants transitively over lineage edges", () => {
    const index = descendantIndex(chainGraph());
    expect(index.countable).toBe(true);
    expect(index.counts.get("a")).toBe(3);
    expect(index.counts.get("c")).toBe(1);
    expect(index.counts.get("d")).toBe(0);
  });

  it("sizes a node by its own count when the count is real", () => {
    const graph = chainGraph();
    const index = descendantIndex(graph);
    const a = graph.nodes[0];
    const d = graph.nodes[3];
    expect(localRadius(a, index, 1, false)).toBeCloseTo(radiusFromDescendants(3), 6);
    expect(localRadius(d, index, 1, false)).toBeCloseTo(radiusFromDescendants(0), 6);
    expect(localRadius(a, index, 2, false)).toBeCloseTo(radiusFromDescendants(3) * 2, 6);
  });

  it("refuses to count when descent is reported round-by-round, and says why", () => {
    // Exactly what build-lineage.ts emits today: a proposal that names every
    // row of a round collapses to one edge from the round HUB, so no run has
    // a descendant set of its own.
    const graph = graphOf(
      [node("hub", { kind: "round-hub" }), node("r1"), node("r2"), node("p", { kind: "proposal" })],
      [
        { id: "h1", kind: "hub-to-run", source: "hub", target: "r1" },
        { id: "h2", kind: "hub-to-run", source: "hub", target: "r2" },
        { id: "d1", kind: "cross-round-descent", source: "hub", target: "p" },
      ],
    );
    const index = descendantIndex(graph);
    expect(index.countable).toBe(false);
    expect(index.reason).toMatch(/round by round, not run by run/);
    // The fallback is the node kind's own vocabulary radius, NOT a fabricated
    // count, and it is identical for every run - which is the honest picture.
    expect(localRadius(graph.nodes[1], index, 1, false)).toBe(NODE_GEOMETRY["measured-run"].r);
    expect(localRadius(graph.nodes[2], index, 1, false)).toBe(NODE_GEOMETRY["measured-run"].r);
  });

  it("reports the no-ancestry case separately from the round-level one", () => {
    const index = descendantIndex(graphOf([node("solo")], []));
    expect(index.countable).toBe(false);
    expect(index.reason).toMatch(/no ancestry/);
  });

  it("survives a cycle without recursing forever", () => {
    const index = descendantIndex(
      graphOf(
        [node("x"), node("y")],
        [
          { id: "c1", kind: "cross-round-descent", source: "x", target: "y" },
          { id: "c2", kind: "cross-round-descent", source: "y", target: "x" },
        ],
      ),
    );
    expect(index.counts.get("x")).toBe(1);
  });

  it("keeps the centre at the spec's fixed radius whatever it descends from", () => {
    const graph = chainGraph();
    expect(localRadius(graph.nodes[0], descendantIndex(graph), 1, true)).toBe(LOCAL_GRAPH.centreR);
  });
});

describe("arrowhead shortening", () => {
  it("stops the line the target radius plus a pad short of its centre", () => {
    const end = shortenToRim({ x: 0, y: 0 }, { x: 100, y: 0 }, 12, 3);
    expect(end).toEqual({ x: 85, y: 0 });
  });

  it("shortens along the edge's own direction, not an axis", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 30, y: 40 }; // length 50
    const end = shortenToRim(from, to, 7, 3);
    expect(Math.hypot(to.x - end.x, to.y - end.y)).toBeCloseTo(10, 6);
    // Still on the line: same direction cosine as the original edge.
    expect(end.x / end.y).toBeCloseTo(30 / 40, 6);
  });

  it("defaults to the spec's pad", () => {
    const end = shortenToRim({ x: 0, y: 0 }, { x: 50, y: 0 }, 10);
    expect(end.x).toBeCloseTo(50 - 10 - LOCAL_GRAPH.arrowPad, 6);
  });

  it("never overshoots past the source on a very short edge", () => {
    const end = shortenToRim({ x: 0, y: 0 }, { x: 5, y: 0 }, 40, 3);
    expect(end).toEqual({ x: 0, y: 0 });
  });

  it("returns the target unchanged for coincident points rather than NaN", () => {
    const end = shortenToRim({ x: 7, y: 9 }, { x: 7, y: 9 }, 12, 3);
    expect(end).toEqual({ x: 7, y: 9 });
    expect(Number.isNaN(end.x)).toBe(false);
  });

  it("grows the gap with the node-size slider, since the radius does", () => {
    const small = shortenToRim({ x: 0, y: 0 }, { x: 100, y: 0 }, radiusFromDescendants(0), 3);
    const large = shortenToRim({ x: 0, y: 0 }, { x: 100, y: 0 }, radiusFromDescendants(14), 3);
    expect(large.x).toBeLessThan(small.x);
  });
});

describe("root candidates", () => {
  it("offers only individually nameable runs - never a hub or a proposal", () => {
    const graph = graphOf(
      [
        node("hub", { kind: "round-hub" }),
        node("prop", { kind: "proposal" }),
        node("run", { kind: "round-best", measuredAtMs: 10 }),
        node("older", { kind: "measured-run", measuredAtMs: 5 }),
      ],
      [],
    );
    expect(runRootCandidates(graph).map((n) => n.id)).toEqual(["run", "older"]);
  });

  it("is empty for the campaign shape today's engine produces", () => {
    // Round hubs plus awaiting proposals: every folded run lost its id.
    const graph = graphOf(
      [node("round-1", { kind: "round-hub" }), node("round-4", { kind: "round-hub-open" }), node("p1", { kind: "proposal" })],
      [],
    );
    expect(runRootCandidates(graph)).toEqual([]);
  });
});

describe("ring geometry", () => {
  it("puts depth 1 at the link distance and grows outward from there", () => {
    expect(ringRadius(0, 120)).toBe(0);
    expect(ringRadius(1, 120)).toBe(120);
    expect(ringRadius(2, 120)).toBeCloseTo(222, 6);
    expect(ringRadius(3, 120)).toBeGreaterThan(ringRadius(2, 120));
  });

  it("spreads a ring evenly at cluster 0 and tightens rounds at cluster 1", () => {
    const rounds = [1, 1, 2, 2];
    const even = ringAngles(rounds, 0);
    const gaps = even.slice(1).map((a, i) => a - even[i]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6);

    const clustered = ringAngles(rounds, 1);
    expect(clustered[1] - clustered[0]).toBeLessThan(even[1] - even[0]);
    // Ordering is preserved, so rounds can never swap places mid-drag.
    for (let i = 1; i < clustered.length; i++) expect(clustered[i]).toBeGreaterThan(clustered[i - 1]);
  });
});

describe("group and filter queries", () => {
  const graph = graphOf(
    [
      node("m1", { round: 3, value: 6.4, recipe: { glucose_gL: 7.2 } }),
      node("m2", { round: 3, value: 5.1, recipe: { glucose_gL: 5.4 } }),
      node("p1", { kind: "proposal", round: 4, value: 7.3 }),
    ],
    [],
  );

  it("parses the spec's own query forms", () => {
    expect(parseQuery("titer >= 6.0")).toEqual({ field: "titer", op: ">=", value: "6.0" });
    expect(parseQuery("status: failed")).toEqual({ field: "status", op: "=", value: "failed" });
    expect(parseQuery("round: 4")).toEqual({ field: "round", op: "=", value: "4" });
    expect(parseQuery("nonsense")).toBeNull();
  });

  it("says a query can never match rather than reporting zero", () => {
    const result = evaluateQuery(graph, "status: failed");
    expect(result.kind).toBe("unbacked");
    if (result.kind === "unbacked") expect(result.reason).toMatch(/can never match/);
  });

  it("matches on real fields", () => {
    const byRound = evaluateQuery(graph, "round: 3");
    expect(byRound.kind === "ok" && byRound.count).toBe(2);
    const byRecipe = evaluateQuery(graph, "glucose_gL > 6");
    expect(byRecipe.kind === "ok" && byRecipe.count).toBe(1);
  });

  it("never counts a proposal's prediction as a measured titer", () => {
    const result = evaluateQuery(graph, "titer >= 6.0");
    expect(result.kind).toBe("ok");
    // m1 only. p1's 7.3 is `pred`, and colouring a prediction as a
    // measurement is the one thing this query must not do.
    if (result.kind === "ok") expect([...result.ids]).toEqual(["m1"]);
  });

  it("reports a campaign whose only values are predictions as unbacked", () => {
    const predictionsOnly = graphOf([node("p1", { kind: "proposal", value: 7.3 })], []);
    expect(evaluateQuery(predictionsOnly, "titer >= 6.0").kind).toBe("unbacked");
  });
});

describe("settings persistence", () => {
  it("hits the spec's worked fill percentages exactly", () => {
    expect(fillPercent(DEFAULT_SETTINGS.depth, SLIDER_RANGE.depth)).toBeCloseTo(33.33, 1);
    expect(fillPercent(DEFAULT_SETTINGS.nodeSize, SLIDER_RANGE.nodeSize)).toBeCloseTo(48, 1);
    expect(fillPercent(DEFAULT_SETTINGS.clusterByRound, SLIDER_RANGE.clusterByRound)).toBeCloseTo(70, 1);
    expect(fillPercent(DEFAULT_SETTINGS.linkDistance, SLIDER_RANGE.linkDistance)).toBeCloseTo(55, 1);
  });

  it("merges a partial or stale blob over the defaults", () => {
    const merged = mergeSettings({ depth: 3, lineageArrows: false });
    expect(merged.depth).toBe(3);
    expect(merged.lineageArrows).toBe(false);
    expect(merged.nodeSize).toBe(DEFAULT_SETTINGS.nodeSize);
    expect(merged.groups).toEqual(DEFAULT_SETTINGS.groups);
  });

  it("clamps an out-of-range value instead of trusting it", () => {
    expect(mergeSettings({ depth: 99 }).depth).toBe(SLIDER_RANGE.depth.max);
    expect(mergeSettings({ linkDistance: -5 }).linkDistance).toBe(SLIDER_RANGE.linkDistance.min);
    expect(mergeSettings("not an object").depth).toBe(DEFAULT_SETTINGS.depth);
  });
});
