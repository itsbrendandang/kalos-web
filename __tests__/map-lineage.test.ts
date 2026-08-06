import { describe, expect, it } from "vitest";
import type { Campaign } from "@/lib/api";
import { attributeFoldedRows, buildLineageGraph } from "@/lib/workspace/graph/build-lineage";
import { MOCK_LINEAGE_CAMPAIGN, MOCK_NOISE_BAND } from "@/lib/workspace/graph/lineage-mock";
import { hubLabelSides, layoutLineage, layoutSignature } from "@/lib/workspace/graph/simulation";
import { MIN_FRAME } from "@/lib/workspace/graph/frame";
import { HUB_LABEL } from "@/lib/workspace/graph/geometry";
import type { LineageGraph } from "@/lib/workspace/map-types";

type ActiveCampaign = Extract<Campaign, { has_campaign: true }>;

/** The campaign the engine actually serves today: no `lineage` block, no
 *  `parent_ids` on any pending run. Every honesty assertion below is anchored
 *  on this being the default, not an edge case. */
const BARE_CAMPAIGN: ActiveCampaign = {
  has_campaign: true,
  target: "titer",
  features: ["glucose"],
  n_base: 40,
  best: 5.2,
  round: 2,
  history: [
    { round: 0, best: 4.0, n_base: 36 },
    { round: 1, best: 4.8, n_base: 38 },
    { round: 2, best: 5.2, n_base: 40 },
  ],
  pending: [
    { id: "a", recipe: { glucose: 6 }, pred: 5.5, std: 0.2, mode: "exploit", reason: "push", result: null, awaiting: true },
    { id: "b", recipe: { glucose: 5 }, pred: 5.1, std: 0.3, mode: "explore", reason: "widen", result: 5.2, awaiting: false },
  ],
  n_awaiting: 1,
  n_measured: 1,
};

function edgesOfKind(graph: LineageGraph, kind: string) {
  return graph.edges.filter((e) => e.kind === kind);
}

describe("attributeFoldedRows", () => {
  const history = [
    { round: 0, best: 1, n_base: 96 },
    { round: 1, best: 2, n_base: 108 },
    { round: 2, best: 3, n_base: 116 },
  ];

  it("counts the whole seeded upload as untraceable - those rows never had ids", () => {
    // Nothing named at all: round 0 owns its 96 uploaded rows PLUS the 12 it
    // produced that the engine could not name (108 - 96), and round 1 owns
    // its own unnamed 8 (116 - 108). Every base row is accounted for and
    // none of them is silently dropped or quietly promoted to "traceable".
    const { untraceableByRound } = attributeFoldedRows([], history);
    expect(untraceableByRound.get(0)).toBe(96 + 12);
    expect(untraceableByRound.get(1)).toBe(8);
    const total = [...untraceableByRound.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(history[history.length - 1].n_base);
  });

  it("attributes each n_base delta to the round whose work produced it", () => {
    const rows = Array.from({ length: 20 }, (_, i) => `row-${i}`);
    const { byRound } = attributeFoldedRows(rows, history);
    // 108 - 96 = 12 rows were measured during round 0 and folded into round 1.
    expect(byRound.get(0)).toHaveLength(12);
    // 116 - 108 = 8 more, measured during round 1.
    expect(byRound.get(1)).toHaveLength(8);
    expect(byRound.get(2)).toHaveLength(0);
  });

  it("records a shortfall as untraceable rather than padding the round out", () => {
    // The history says 20 rows were folded but the engine only named 5.
    const { byRound, untraceableByRound } = attributeFoldedRows(["a", "b", "c", "d", "e"], history);
    expect(byRound.get(0)).toHaveLength(5);
    expect(byRound.get(1)).toHaveLength(0);
    // 12 claimed - 5 named = 7 unnamed in round 0, plus round 1's whole 8.
    expect(untraceableByRound.get(0)).toBe(96 + 7);
    expect(untraceableByRound.get(1)).toBe(8);
  });
});

describe("buildLineageGraph - structure", () => {
  const graph = buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: MOCK_NOISE_BAND });

  it("draws one hub per history point, with exactly one open round", () => {
    const hubs = graph.nodes.filter((n) => n.kind === "round-hub" || n.kind === "round-hub-open");
    expect(hubs).toHaveLength(MOCK_LINEAGE_CAMPAIGN.history.length);
    expect(hubs.filter((h) => h.kind === "round-hub-open")).toHaveLength(1);
    expect(hubs.find((h) => h.kind === "round-hub-open")?.round).toBe(MOCK_LINEAGE_CAMPAIGN.round);
  });

  it("chains the hubs with one spine segment per adjacent pair", () => {
    expect(edgesOfKind(graph, "round-spine")).toHaveLength(MOCK_LINEAGE_CAMPAIGN.history.length - 1);
  });

  it("emits one proposal node per awaiting run and attaches every node to its hub", () => {
    expect(graph.nodes.filter((n) => n.kind === "proposal")).toHaveLength(MOCK_LINEAGE_CAMPAIGN.n_awaiting);
    const nonHub = graph.nodes.filter((n) => n.kind !== "round-hub" && n.kind !== "round-hub-open");
    expect(edgesOfKind(graph, "hub-to-run")).toHaveLength(nonHub.length);
  });

  it("never emits an edge whose endpoints are not both real nodes", () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("never emits a node the engine did not report - no synthetic ancestors", () => {
    const namedIds = new Set([
      ...(MOCK_LINEAGE_CAMPAIGN.lineage?.folded_rows ?? []).map((r) => `run-${r.run_id}`),
      ...MOCK_LINEAGE_CAMPAIGN.pending.map((r) => `run-${r.id}`),
      ...MOCK_LINEAGE_CAMPAIGN.history.map((h) => `round-${h.round}`),
    ]);
    for (const n of graph.nodes) expect(namedIds.has(n.id)).toBe(true);
  });

  it("marks SOP as never instrumented - kalos has no SOP concept to draw from", () => {
    expect(graph.instrumented.sop).toBe(false);
    expect(graph.nodes.filter((n) => n.kind === "sop")).toHaveLength(0);
  });
});

describe("buildLineageGraph - the traceable vs untraceable rule", () => {
  const graph = buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: MOCK_NOISE_BAND });

  it("keeps both halves of provenance on the node, never collapsing them", () => {
    const proposal = graph.nodes.find((n) => n.kind === "proposal");
    expect(proposal?.provenance).not.toBeNull();
    expect(proposal!.provenance!.totalCount).toBe(MOCK_LINEAGE_CAMPAIGN.n_base);
    // The named subset is strictly smaller than the true total: that gap is
    // the whole point, and it must survive into the data model.
    expect(proposal!.provenance!.traceableIds.length).toBeLessThan(proposal!.provenance!.totalCount!);
  });

  it("carries the unnamed remainder as a counted stub, not as edges or nodes", () => {
    const proposal = graph.nodes.find((n) => n.kind === "proposal")!;
    const stub = graph.stubs.find((s) => s.nodeId === proposal.id);
    const named = proposal.provenance!.traceableIds.length;
    expect(stub?.count).toBe(proposal.provenance!.totalCount! - named);
    // A stub is a count, not a graph object: no node and no edge exists for it.
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(ids.has(stub!.id)).toBe(false);
    expect(graph.edges.some((e) => e.source === stub!.id || e.target === stub!.id)).toBe(false);
  });

  it("never draws more descent into a node than the engine named", () => {
    const byTarget = new Map<string, number>();
    for (const e of edgesOfKind(graph, "cross-round-descent")) {
      byTarget.set(e.target, (byTarget.get(e.target) ?? 0) + 1);
    }
    for (const [target, count] of byTarget) {
      const node = graph.nodes.find((n) => n.id === target)!;
      expect(node.provenance).not.toBeNull();
      expect(count).toBeLessThanOrEqual(node.provenance!.traceableIds.length);
    }
  });

  it("draws no descent and no per-run provenance for the campaign the engine serves today", () => {
    const bare = buildLineageGraph(BARE_CAMPAIGN, { noiseBand: null });
    expect(bare.instrumented.perRunLineage).toBe(false);
    expect(edgesOfKind(bare, "cross-round-descent")).toHaveLength(0);
    for (const n of bare.nodes) {
      if (n.kind === "round-hub" || n.kind === "round-hub-open") continue;
      expect(n.provenance).toBeNull();
    }
  });

  it("still admits the uploaded rows exist, as an untraceable count on the base hub", () => {
    const bare = buildLineageGraph(BARE_CAMPAIGN, { noiseBand: null });
    const baseStub = bare.stubs.find((s) => s.nodeId === "round-0");
    // 36 uploaded rows, plus the 2 rows round 0 folded that it could not name.
    const uploaded = BARE_CAMPAIGN.history[0].n_base;
    const unnamedFold = BARE_CAMPAIGN.history[1].n_base - uploaded;
    expect(baseStub?.count).toBe(uploaded + unnamedFold);
  });
});

describe("buildLineageGraph - within-noise neighbour edges", () => {
  it("draws none without a band, rather than inventing an epsilon", () => {
    const graph = buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: null });
    expect(edgesOfKind(graph, "run-neighbour")).toHaveLength(0);
  });

  it("only joins same-round runs whose outcomes are within the band", () => {
    const graph = buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: MOCK_NOISE_BAND });
    const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
    for (const e of edgesOfKind(graph, "run-neighbour")) {
      const a = byId.get(e.source)!;
      const b = byId.get(e.target)!;
      expect(a.round).toBe(b.round);
      expect(Math.abs(a.value! - b.value!)).toBeLessThanOrEqual(MOCK_NOISE_BAND);
    }
  });
});

describe("layoutSignature", () => {
  const graph = buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: MOCK_NOISE_BAND });

  it("is stable when only node VALUES change - the layout must not re-solve", () => {
    const restated: LineageGraph = {
      ...graph,
      nodes: graph.nodes.map((n) => ({ ...n, value: (n.value ?? 0) + 1, label: `${n.label}!` })),
    };
    expect(layoutSignature(restated)).toBe(layoutSignature(graph));
  });

  it("changes when the node set changes", () => {
    const dropped: LineageGraph = { ...graph, nodes: graph.nodes.slice(1) };
    expect(layoutSignature(dropped)).not.toBe(layoutSignature(graph));
  });
});

describe("layoutLineage", () => {
  const graph = buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: MOCK_NOISE_BAND });

  it("settles to the same coordinates every time it is run on the same graph", () => {
    const a = layoutLineage(graph);
    const b = layoutLineage(graph);
    for (const [id, point] of a.positions) {
      expect(b.positions.get(id)?.x).toBeCloseTo(point.x, 9);
      expect(b.positions.get(id)?.y).toBeCloseTo(point.y, 9);
    }
  });

  it("positions every node finitely and pins the hubs to their spine slots", () => {
    const layout = layoutLineage(graph);
    expect(layout.positions.size).toBe(graph.nodes.length);
    for (const p of layout.positions.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    for (const hub of graph.nodes.filter((n) => n.kind === "round-hub" || n.kind === "round-hub-open")) {
      const pinned = layout.hubPositions.get(hub.round)!;
      expect(layout.positions.get(hub.id)!.x).toBeCloseTo(pinned.x, 9);
      expect(layout.positions.get(hub.id)!.y).toBeCloseTo(pinned.y, 9);
    }
  });

  it("frames every node inside the camera's viewBox", () => {
    const layout = layoutLineage(graph);
    const { frame } = layout;
    for (const p of layout.positions.values()) {
      expect(p.x).toBeGreaterThanOrEqual(frame.x);
      expect(p.x).toBeLessThanOrEqual(frame.x + frame.width);
      expect(p.y).toBeGreaterThanOrEqual(frame.y);
      expect(p.y).toBeLessThanOrEqual(frame.y + frame.height);
    }
  });

  // Revised after looking at the real engine's campaign on screen: with no
  // named runs there are only four hubs, and a camera framed on the design
  // mock's fixed canvas left them marooned in a large empty plane. The frame
  // now shrinks onto the content, and the clamp is what stops it shrinking so
  // far that four hubs render as four enormous discs.
  it("clamps the camera so a sparse campaign does not blow up", () => {
    const tiny = buildLineageGraph(BARE_CAMPAIGN, { noiseBand: null });
    const { frame } = layoutLineage(tiny);
    expect(frame.width).toBeGreaterThanOrEqual(MIN_FRAME.width);
    expect(frame.height).toBeGreaterThanOrEqual(MIN_FRAME.height);
  });

  it("leaves each cluster ring clear on whichever side its round label sits", () => {
    const layout = layoutLineage(graph);
    const sides = hubLabelSides(layout.hubPositions);
    const hubs = new Map(graph.nodes.filter((n) => n.kind === "round-hub" || n.kind === "round-hub-open").map((h) => [h.round, h.id]));
    for (const node of graph.nodes) {
      const hubNodeId = hubs.get(node.round);
      if (!hubNodeId || hubNodeId === node.id) continue;
      const p = layout.positions.get(node.id)!;
      const h = layout.hubPositions.get(node.round)!;
      const side = sides.get(node.round) ?? "above";
      const offsets = HUB_LABEL[side];
      // Nothing should end up in the narrow column the label occupies, on
      // whichever side of the hub the label was placed.
      const near = Math.min(Math.abs(offsets.name), Math.abs(offsets.sub)) - 7;
      const far = Math.max(Math.abs(offsets.name), Math.abs(offsets.sub)) + 10;
      const along = side === "below" ? p.y - h.y : h.y - p.y;
      if (along > near && along < far) expect(Math.abs(p.x - h.x)).toBeGreaterThan(18);
    }
  });
});
