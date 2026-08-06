import { describe, expect, it } from "vitest";
import { attributeFoldedRows, buildLineageGraph, lineageTicks, type LineageSource } from "@/lib/workspace/graph/build-lineage";
import { incidentEdges, neighborhood } from "@/lib/workspace/graph/neighborhood";
import { projectDate, revealedIds, tickPositions } from "@/lib/workspace/graph/replay";
import { radiusFromDescendants } from "@/lib/workspace/graph/geometry";
import { layoutLineage, layoutSignature } from "@/lib/workspace/graph/simulation";
import { countNeighbours, neighbourhoodNarrative, provenanceOf } from "@/lib/workspace/graph/narrative";
import { MOCK_LINEAGE_CAMPAIGN, MOCK_NOISE_BAND } from "@/lib/workspace/graph/lineage-mock";
import type { MapEdge } from "@/lib/workspace/map-types";

const DAY = 86_400;

function run(overrides: Partial<LineageSource["pending"][number]> & { id: string }): LineageSource["pending"][number] {
  return {
    recipe: { glucose: 5 },
    pred: 4,
    std: 0.2,
    mode: "exploit",
    reason: "test",
    result: null,
    awaiting: true,
    ...overrides,
  };
}

/** Two rounds: 10 uploaded rows with no ids, then 2 runs folded in that DO
 *  keep their ids, then one open round with proposals. */
function source(overrides: Partial<LineageSource> = {}): LineageSource {
  return {
    has_campaign: true,
    target: "titer",
    features: ["glucose"],
    n_base: 12,
    best: 2,
    round: 1,
    history: [
      { round: 0, best: 1, n_base: 10 },
      { round: 1, best: 2, n_base: 12 },
    ],
    pending: [],
    n_awaiting: 0,
    n_measured: 0,
    lineage: {
      folded_rows: [
        { run_id: "a", created_at: 100, measured_at: 200 },
        { run_id: "b", created_at: 110, measured_at: 210 },
      ],
    },
    ...overrides,
  };
}

describe("neighborhood (BFS)", () => {
  const edges: MapEdge[] = [
    { id: "e1", kind: "hub-to-run", source: "hub", target: "n1" },
    { id: "e2", kind: "hub-to-run", source: "hub", target: "n2" },
    { id: "e3", kind: "run-neighbour", source: "n1", target: "n3" },
    { id: "e4", kind: "run-neighbour", source: "n3", target: "n4" },
    { id: "e5", kind: "hub-to-run", source: "other", target: "n9" },
  ];

  it("depth 0 is the node itself", () => {
    expect([...neighborhood("n1", edges, 0)]).toEqual(["n1"]);
  });

  it("depth 1 reaches direct neighbours in both edge directions", () => {
    expect([...neighborhood("n1", edges, 1)].sort()).toEqual(["hub", "n1", "n3"]);
  });

  it("depth 2 reaches two hops and no further", () => {
    const two = neighborhood("n1", edges, 2);
    expect(two.has("n4")).toBe(true);
    expect(two.has("n2")).toBe(true);
    expect(two.has("n9")).toBe(false);
  });

  it("stops early when the component is exhausted rather than looping", () => {
    expect(neighborhood("n9", edges, 9)).toEqual(new Set(["n9", "other"]));
  });

  it("returns an unknown node as its own singleton", () => {
    expect(neighborhood("nope", edges, 3)).toEqual(new Set(["nope"]));
  });

  it("incidentEdges keeps every edge touching the set", () => {
    const ids = new Set(["n1"]);
    expect(incidentEdges(ids, edges).map((e) => e.id)).toEqual(["e1", "e3"]);
  });
});

describe("replay tick positioning (real elapsed date, not round index)", () => {
  const may12 = Date.parse("2026-05-12T00:00:00Z");
  const jun3 = Date.parse("2026-06-03T00:00:00Z");
  const jul21 = Date.parse("2026-07-21T00:00:00Z");

  it("spaces ticks by elapsed time, so a long wait is a long gap", () => {
    const pos = tickPositions([
      { id: "r1", dateMs: may12 },
      { id: "r2", dateMs: jun3 },
      { id: "r3", dateMs: jul21 },
      { id: "r4", dateMs: null },
    ]);
    expect(pos.map((p) => p.id)).toEqual(["r1", "r2", "r3", "r4"]);
    expect(pos[0].pct).toBe(0);
    expect(pos[2].pct).toBe(82);
    expect(pos[3].pct).toBe(100);
    // 22 days of 70 elapsed, scaled into the 0-82 dated band.
    expect(pos[1].pct).toBeCloseTo((22 / 70) * 82, 6);
    // The middle tick is NOT at the round-index position (1/3 of the track).
    expect(Math.abs(pos[1].pct - 33.3)).toBeGreaterThan(6);
  });

  it("uses the whole track when nothing is undated", () => {
    const pos = tickPositions([
      { id: "a", dateMs: may12 },
      { id: "b", dateMs: jul21 },
    ]);
    expect(pos[1].pct).toBe(100);
  });

  it("puts a single dated tick at 0 rather than dividing by a zero span", () => {
    const pos = tickPositions([{ id: "only", dateMs: may12 }]);
    expect(pos[0].pct).toBe(0);
  });

  it("projects an arbitrary date onto the same axis, clamped at both ends", () => {
    const pos = tickPositions([
      { id: "r1", dateMs: may12 },
      { id: "r2", dateMs: jul21 },
      { id: "r3", dateMs: null },
    ]);
    expect(projectDate(may12, pos)).toBe(0);
    expect(projectDate(jul21, pos)).toBeCloseTo(82, 6);
    expect(projectDate(jun3, pos)).toBeCloseTo((22 / 70) * 82, 6);
    // Past the last dated anchor: clamps, never rescales the footer.
    expect(projectDate(jul21 + 999 * 86_400_000, pos)).toBe(100);
    expect(projectDate(may12 - 999 * 86_400_000, pos)).toBe(0);
  });

  it("reveals every tick at or before the scrub position", () => {
    const pos = tickPositions([
      { id: "r1", dateMs: may12 },
      { id: "r2", dateMs: jun3 },
      { id: "r3", dateMs: jul21 },
      { id: "r4", dateMs: null },
    ]);
    expect(revealedIds(pos, 0)).toEqual(new Set(["r1"]));
    expect(revealedIds(pos, 50)).toEqual(new Set(["r1", "r2"]));
    expect(revealedIds(pos, 100)).toEqual(new Set(["r1", "r2", "r3", "r4"]));
  });
});

describe("radiusFromDescendants", () => {
  it("grows with descendant count", () => {
    expect(radiusFromDescendants(0)).toBe(7);
    expect(radiusFromDescendants(5)).toBeCloseTo(7 + 5 * 0.62, 6);
    expect(radiusFromDescendants(1)).toBeGreaterThan(radiusFromDescendants(0));
  });

  it("caps so one outlier cannot dominate the canvas", () => {
    expect(radiusFromDescendants(14)).toBe(radiusFromDescendants(400));
  });
});

describe("attributeFoldedRows", () => {
  it("attributes a fold to the round whose work it was, not the round it opened", () => {
    const { byRound } = attributeFoldedRows(["a", "b"], [
      { round: 0, best: null, n_base: 10 },
      { round: 1, best: null, n_base: 12 },
    ]);
    expect(byRound.get(0)).toEqual(["a", "b"]);
    expect(byRound.get(1)).toEqual([]);
  });

  it("counts the seeded upload as untraceable, because those rows never had ids", () => {
    const { untraceableByRound } = attributeFoldedRows(["a", "b"], [
      { round: 0, best: null, n_base: 10 },
      { round: 1, best: null, n_base: 12 },
    ]);
    expect(untraceableByRound.get(0)).toBe(10);
  });

  it("records a shortfall as untraceable instead of padding with invented rows", () => {
    const { byRound, untraceableByRound } = attributeFoldedRows(["a"], [
      { round: 0, best: null, n_base: 0 },
      { round: 1, best: null, n_base: 5 },
    ]);
    expect(byRound.get(0)).toEqual(["a"]);
    expect(untraceableByRound.get(0)).toBe(4);
  });

  it("keeps surplus named rows rather than dropping them", () => {
    const { byRound } = attributeFoldedRows(["a", "b", "c"], [
      { round: 0, best: null, n_base: 0 },
      { round: 1, best: null, n_base: 1 },
    ]);
    expect(byRound.get(0)).toEqual(["a", "b", "c"]);
  });
});

describe("buildLineageGraph: traceable vs total", () => {
  const opts = { noiseBand: null };

  it("draws one edge per NAMED ancestor and never one per claimed row", () => {
    const graph = buildLineageGraph(
      source({
        round: 1,
        pending: [run({ id: "p1", parent_ids: ["a"], parent_row_count: 12 })],
        n_awaiting: 1,
      }),
      opts,
    );
    const descent = graph.edges.filter((e) => e.kind === "cross-round-descent");
    expect(descent).toHaveLength(1);
    expect(descent[0].source).toBe("run-a");
    expect(descent[0].target).toBe("run-p1");
  });

  it("records the unnamed remainder as a counted stub, not as nodes or edges", () => {
    const graph = buildLineageGraph(
      source({ round: 1, pending: [run({ id: "p1", parent_ids: ["a"], parent_row_count: 12 })], n_awaiting: 1 }),
      opts,
    );
    const stub = graph.stubs.find((s) => s.nodeId === "run-p1");
    expect(stub?.count).toBe(11);
    // Nothing was fabricated to carry those 11 rows.
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["round-0", "round-1", "run-a", "run-b", "run-p1"]);
  });

  it("never invents an id for an ancestor the engine did not name", () => {
    const graph = buildLineageGraph(
      source({ round: 1, pending: [run({ id: "p1", parent_ids: [], parent_row_count: 12 })], n_awaiting: 1 }),
      opts,
    );
    expect(graph.edges.filter((e) => e.kind === "cross-round-descent")).toHaveLength(0);
    expect(graph.stubs.find((s) => s.nodeId === "run-p1")?.count).toBe(12);
  });

  it("collapses to the round hub ONLY when a whole round is named (lossless)", () => {
    const graph = buildLineageGraph(
      source({ round: 1, pending: [run({ id: "p1", parent_ids: ["a", "b"], parent_row_count: 12 })], n_awaiting: 1 }),
      opts,
    );
    const descent = graph.edges.filter((e) => e.kind === "cross-round-descent");
    expect(descent).toHaveLength(1);
    expect(descent[0].source).toBe("round-0");
    // The count is still the honest one: 2 named of 12 total.
    expect(graph.stubs.find((s) => s.nodeId === "run-p1")?.count).toBe(10);
  });

  it("reports no ancestry at all rather than a zero when the engine sends none", () => {
    const graph = buildLineageGraph(source({ round: 1, pending: [run({ id: "p1" })], n_awaiting: 1 }), opts);
    expect(graph.nodes.find((n) => n.id === "run-p1")?.provenance).toBeNull();
    expect(graph.stubs.some((s) => s.nodeId === "run-p1")).toBe(false);
  });

  it("marks per-run lineage as uninstrumented when the engine reports none", () => {
    const bare = buildLineageGraph(
      { ...source(), lineage: undefined, n_base: 10, history: [{ round: 0, best: 1, n_base: 10 }], round: 0 },
      opts,
    );
    expect(bare.instrumented.perRunLineage).toBe(false);
    expect(bare.stubs.find((s) => s.nodeId === "round-0")?.count).toBe(10);
  });

  it("never emits SOP or failed-run nodes, because kalos models neither", () => {
    const graph = buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: MOCK_NOISE_BAND });
    expect(graph.nodes.some((n) => n.kind === "sop")).toBe(false);
    expect(graph.nodes.some((n) => n.kind === "failed-run")).toBe(false);
    expect(graph.instrumented.sop).toBe(false);
  });
});

describe("buildLineageGraph: rounds, runs, and values", () => {
  it("opens exactly one hub, and it is the engine's current round", () => {
    const graph = buildLineageGraph(source({ round: 1 }), { noiseBand: null });
    const open = graph.nodes.filter((n) => n.kind === "round-hub-open");
    expect(open).toHaveLength(1);
    expect(open[0].round).toBe(1);
  });

  it("leaves a folded run's value and recipe null, because the fold discards them", () => {
    const graph = buildLineageGraph(source(), { noiseBand: null });
    const folded = graph.nodes.find((n) => n.id === "run-a");
    expect(folded?.value).toBeNull();
    expect(folded?.recipe).toBeNull();
    expect(folded?.measuredAtMs).toBe(200_000);
  });

  it("keeps a proposal's prediction in `value` with its band, never as a measurement", () => {
    const graph = buildLineageGraph(
      source({ round: 1, pending: [run({ id: "p1", pred: 7.3, std: 0.4 })], n_awaiting: 1 }),
      { noiseBand: null },
    );
    const node = graph.nodes.find((n) => n.id === "run-p1");
    expect(node?.kind).toBe("proposal");
    expect(node?.value).toBe(7.3);
    expect(node?.band).toBe(0.4);
  });

  it("marks the best measured-but-unfolded run of the open round as the round best", () => {
    const graph = buildLineageGraph(
      source({
        round: 1,
        pending: [
          run({ id: "m1", awaiting: false, result: 5 }),
          run({ id: "m2", awaiting: false, result: 7 }),
        ],
        n_measured: 2,
      }),
      { noiseBand: null },
    );
    expect(graph.nodes.find((n) => n.id === "run-m2")?.kind).toBe("round-best");
    expect(graph.nodes.find((n) => n.id === "run-m1")?.kind).toBe("measured-run");
    // The open hub reflects the freshest real measurement, not the stale fold.
    expect(graph.nodes.find((n) => n.kind === "round-hub-open")?.value).toBe(7);
  });

  it("draws neighbour edges only inside the engine's own conformal band", () => {
    const withBand = buildLineageGraph(
      source({
        round: 1,
        pending: [
          run({ id: "m1", awaiting: false, result: 5.0 }),
          run({ id: "m2", awaiting: false, result: 5.05 }),
          run({ id: "m3", awaiting: false, result: 9.0 }),
        ],
        n_measured: 3,
      }),
      { noiseBand: 0.1 },
    );
    expect(withBand.edges.filter((e) => e.kind === "run-neighbour")).toHaveLength(1);
  });

  it("draws no neighbour edges at all when the engine reports no band", () => {
    const noBand = buildLineageGraph(
      source({
        round: 1,
        pending: [run({ id: "m1", awaiting: false, result: 5 }), run({ id: "m2", awaiting: false, result: 5 })],
        n_measured: 2,
      }),
      { noiseBand: null },
    );
    expect(noBand.edges.filter((e) => e.kind === "run-neighbour")).toHaveLength(0);
  });

  it("counts base rows and started runs, but never an unrun proposal", () => {
    // The overlay renders this as "N runs". A proposal nobody has executed is
    // not a run, so it must not inflate that number - only base rows and
    // started-and-measured runs count.
    const withProposal = buildLineageGraph(source({ round: 1, pending: [run({ id: "p1" })], n_awaiting: 1 }), {
      noiseBand: null,
    });
    expect(withProposal.runCount).toBe(12);

    const withMeasured = buildLineageGraph(
      source({ round: 1, pending: [run({ id: "m1", awaiting: false, result: 5 })], n_measured: 1 }),
      { noiseBand: null },
    );
    expect(withMeasured.runCount).toBe(13);
    expect(withMeasured.roundCount).toBe(2);
  });
});

describe("lineageTicks", () => {
  it("dates a closed round by its last readout and leaves the open round undated", () => {
    const graph = buildLineageGraph(source(), { noiseBand: null });
    const ticks = lineageTicks(graph, 1);
    expect(ticks).toEqual([
      { id: "round-0", round: 0, dateMs: 210_000 },
      { id: "round-1", round: 1, dateMs: null },
    ]);
  });

  it("drops leading rounds the engine cannot date rather than misplacing them", () => {
    const graph = buildLineageGraph(
      {
        ...source(),
        round: 2,
        history: [
          { round: 0, best: 1, n_base: 10 },
          { round: 1, best: 1, n_base: 10 },
          { round: 2, best: 2, n_base: 12 },
        ],
      },
      { noiseBand: null },
    );
    // Round 0 folded nothing (n_base is flat across it), so it has no date.
    expect(lineageTicks(graph, 2).map((t) => t.round)).toEqual([1, 2]);
  });

  it("produces an uneven, real-time track for the demo campaign", () => {
    const graph = buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: MOCK_NOISE_BAND });
    const pos = tickPositions(lineageTicks(graph, MOCK_LINEAGE_CAMPAIGN.round));
    expect(pos).toHaveLength(5);
    expect(pos[0].pct).toBe(0);
    expect(pos[4].pct).toBe(100);
    const gaps = pos.slice(1).map((p, i) => p.pct - pos[i].pct);
    expect(new Set(gaps.map((g) => g.toFixed(1))).size).toBeGreaterThan(1);
  });
});

describe("narrative", () => {
  const graph = buildLineageGraph(
    source({
      round: 1,
      pending: [
        run({ id: "m1", awaiting: false, result: 5.0 }),
        run({ id: "m2", awaiting: false, result: 5.02 }),
        run({ id: "m3", awaiting: false, result: 5.04 }),
        run({ id: "p1", parent_ids: ["a"], parent_row_count: 12 }),
      ],
      n_awaiting: 1,
      n_measured: 3,
    }),
    { noiseBand: 0.1 },
  );

  it("counts neighbours from the graph it describes", () => {
    expect(countNeighbours(graph, "run-m2")).toBe(2);
  });

  it("states the traceable split, and only the split the graph supports", () => {
    const node = graph.nodes.find((n) => n.id === "run-p1")!;
    expect(provenanceOf(graph, node)).toEqual({ named: 1, total: 12 });
    expect(neighbourhoodNarrative(graph, node, 0.1)).toContain("descends from 12 rows, 1 of which can be named");
  });

  it("says nothing about noise when the engine reported no band", () => {
    const node = graph.nodes.find((n) => n.id === "run-m1")!;
    expect(neighbourhoodNarrative(graph, node, null)).toBeNull();
  });
});

describe("layout (frozen d3-force simulation)", () => {
  const graph = buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: MOCK_NOISE_BAND });

  it("is deterministic: the same graph always settles to the same layout", () => {
    const a = layoutLineage(graph);
    const b = layoutLineage(graph);
    for (const [id, point] of a.positions) {
      expect(b.positions.get(id)).toEqual(point);
    }
    expect(b.frame).toEqual(a.frame);
  });

  it("positions every node exactly once, with finite coordinates", () => {
    const { positions } = layoutLineage(graph);
    expect(positions.size).toBe(graph.nodes.length);
    for (const p of positions.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("pins round hubs in round order along the spine", () => {
    const { hubPositions } = layoutLineage(graph);
    const xs = [...hubPositions.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  it("keeps clusters apart: no two nodes end up on top of each other", () => {
    const { positions } = layoutLineage(graph);
    const points = [...positions.values()];
    let minGap = Infinity;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        minGap = Math.min(minGap, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
      }
    }
    expect(minGap).toBeGreaterThan(12);
  });

  it("changes signature only when the node or edge SET changes", () => {
    const same = buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: MOCK_NOISE_BAND });
    expect(layoutSignature(same)).toBe(layoutSignature(graph));
    const fewer = { ...graph, nodes: graph.nodes.slice(0, -1) };
    expect(layoutSignature(fewer)).not.toBe(layoutSignature(graph));
  });

});

describe("demo lineage payload", () => {
  it("is engine-shaped, so demo and real data share one code path", () => {
    expect(MOCK_LINEAGE_CAMPAIGN.has_campaign).toBe(true);
    expect(MOCK_LINEAGE_CAMPAIGN.lineage?.folded_rows.length).toBe(46);
    for (const r of MOCK_LINEAGE_CAMPAIGN.pending) {
      expect(r.parent_row_count).toBeGreaterThan((r.parent_ids ?? []).length);
    }
  });

  it("keeps 96 uploaded rows permanently untraceable", () => {
    const graph = buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: MOCK_NOISE_BAND });
    expect(graph.stubs.find((s) => s.nodeId === "round-0")?.count).toBe(96);
    expect(graph.nodes.filter((n) => n.round === 0 && n.kind === "measured-run")).toHaveLength(12);
  });
});

describe("elapsed time in the demo campaign", () => {
  it("has a longer gap before round 3 than between rounds 1 and 2", () => {
    const rows = MOCK_LINEAGE_CAMPAIGN.lineage!.folded_rows;
    const closes = [0, 12, 24, 36].map((start, i) =>
      Math.max(...rows.slice(start, start + [12, 12, 12, 10][i]).map((r) => r.measured_at ?? 0)),
    );
    const gaps = closes.slice(1).map((c, i) => (c - closes[i]) / DAY);
    expect(gaps[2]).toBeGreaterThan(gaps[0] * 2);
  });
});
