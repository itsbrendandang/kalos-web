// The Lineage lens CAMERA (lib/workspace/graph/frame.ts) and the two things
// that hang off it: which side a round's label sits on, and the legend's
// present/absent flags.
//
// The camera is the piece most likely to fail silently. A wrong viewBox does
// not throw, it just renders the graph small, off-centre, or clipped, and a
// NaN one renders a blank panel with no error at all - so the degenerate
// cases (no nodes, one node, collinear nodes, non-finite coordinates) are
// asserted explicitly rather than assumed.
import { describe, expect, it } from "vitest";
import { MIN_FRAME, calloutAnchor, contentBounds, fitViewBox, type Bounds } from "@/lib/workspace/graph/frame";
import { HUB_LABEL, NODE_GEOMETRY, SELECTION_RING, STUB_REACH } from "@/lib/workspace/graph/geometry";
import { legendEntries } from "@/lib/workspace/graph/legend";
import { hubLabelSides, layoutLineage } from "@/lib/workspace/graph/simulation";
import { buildLineageGraph, type LineageSource } from "@/lib/workspace/graph/build-lineage";
import type { LineageGraph, MapNode, MapNodeKind } from "@/lib/workspace/map-types";

function node(id: string, kind: MapNodeKind, round: number, overrides: Partial<MapNode> = {}): MapNode {
  return {
    id,
    kind,
    round,
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

function bounds(nodes: MapNode[], positions: [string, { x: number; y: number }][], extra: Partial<Parameters<typeof contentBounds>[0]> = {}) {
  return contentBounds({
    nodes,
    stubs: [],
    positions: new Map(positions),
    hubPositions: new Map(),
    labelSides: new Map(),
    ...extra,
  });
}

describe("fitViewBox: degenerate cases never produce a NaN or a blown-up camera", () => {
  it("returns a MIN_FRAME box on the origin when there is nothing to frame", () => {
    const frame = fitViewBox(null);
    expect(frame).toEqual({ x: -MIN_FRAME.width / 2, y: -MIN_FRAME.height / 2, width: MIN_FRAME.width, height: MIN_FRAME.height });
  });

  it("clamps a single node up to MIN_FRAME instead of framing one enormous disc", () => {
    const frame = fitViewBox({ minX: 90, maxX: 124, minY: -8, maxY: 26 });
    expect(frame.width).toBe(MIN_FRAME.width);
    expect(frame.height).toBe(MIN_FRAME.height);
    // Still centred on the node it framed.
    expect(frame.x + frame.width / 2).toBeCloseTo(107, 9);
    expect(frame.y + frame.height / 2).toBeCloseTo(9, 9);
  });

  it("clamps only the collapsed axis when every node is collinear", () => {
    const horizontal = fitViewBox({ minX: -900, maxX: 900, minY: 40, maxY: 40 });
    expect(horizontal.width).toBeGreaterThan(1800);
    expect(horizontal.height).toBe(MIN_FRAME.height);
    expect(horizontal.y + horizontal.height / 2).toBeCloseTo(40, 9);

    const vertical = fitViewBox({ minX: 12, maxX: 12, minY: -600, maxY: 600 });
    expect(vertical.width).toBe(MIN_FRAME.width);
    expect(vertical.height).toBeGreaterThan(1200);
    expect(vertical.x + vertical.width / 2).toBeCloseTo(12, 9);
  });

  it("treats non-finite bounds as no content rather than emitting a NaN viewBox", () => {
    for (const b of [
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
      { minX: NaN, maxX: 10, minY: 0, maxY: 10 },
      { minX: 0, maxX: 10, minY: 0, maxY: Infinity },
    ] as Bounds[]) {
      const frame = fitViewBox(b);
      for (const v of [frame.x, frame.y, frame.width, frame.height]) expect(Number.isFinite(v)).toBe(true);
      expect(frame.width).toBe(MIN_FRAME.width);
      expect(frame.height).toBe(MIN_FRAME.height);
    }
  });

  it("grows past the clamp for a large graph, staying centred on the content", () => {
    const frame = fitViewBox({ minX: -1500, maxX: 2500, minY: -700, maxY: 900 });
    expect(frame.width).toBeGreaterThan(4000);
    expect(frame.height).toBeGreaterThan(1600);
    expect(frame.x + frame.width / 2).toBeCloseTo(500, 9);
    expect(frame.y + frame.height / 2).toBeCloseTo(100, 9);
  });
});

describe("contentBounds: the box covers what is painted, not just the discs", () => {
  it("is null when there is nothing positioned", () => {
    expect(bounds([], [])).toBeNull();
    expect(bounds([node("a", "measured-run", 1)], [])).toBeNull();
  });

  it("skips nodes whose settled coordinates are not finite", () => {
    expect(bounds([node("a", "measured-run", 1)], [["a", { x: NaN, y: 0 }]])).toBeNull();
  });

  it("reaches above a hub for its label, and below it when the label moved", () => {
    const hub = node("round-2", "round-hub", 2, { label: "ROUND 2", sublabel: "22 runs folded" });
    const above = bounds([hub], [["round-2", { x: 0, y: 0 }]], { labelSides: new Map([[2, "above" as const]]) })!;
    const below = bounds([hub], [["round-2", { x: 0, y: 0 }]], { labelSides: new Map([[2, "below" as const]]) })!;

    expect(above.minY).toBeLessThan(HUB_LABEL.above.name);
    expect(above.maxY).toBeCloseTo(NODE_GEOMETRY["round-hub"].r, 9);

    expect(below.maxY).toBeGreaterThan(HUB_LABEL.below.sub);
    expect(below.minY).toBeCloseTo(-NODE_GEOMETRY["round-hub"].r, 9);

    // The sub-caption is far wider than the r=17 disc, on either side.
    expect(above.maxX - above.minX).toBeGreaterThan(60);
  });

  it("reserves room for a round-best callout, which is painted with no interaction", () => {
    const best = node("run-a", "round-best", 1, { label: "Run 4f21c0", value: 6.4 });
    const b = bounds([best], [["run-a", { x: 0, y: 0 }]], { hubPositions: new Map([[1, { x: -100, y: 0 }]]) })!;
    // The callout hangs to the right, away from the hub, well past both the
    // disc and its selection ring.
    expect(b.maxX).toBeGreaterThan(SELECTION_RING.haloR + 40);
    expect(b.minX).toBeCloseTo(-SELECTION_RING.haloR, 9);
  });

  it("does NOT reserve room for hover-only callouts, so the resting graph stays centred", () => {
    // Reserving for these pushed the frame sideways by the width of a label
    // nobody was looking at, and the graph hung off-centre as a result. The
    // renderer flips such a callout inward instead (see calloutAnchor).
    const run = node("run-a", "measured-run", 1, { label: "Run 4f21c0", value: 6.4 });
    const b = bounds([run], [["run-a", { x: 0, y: 0 }]], { hubPositions: new Map([[1, { x: -100, y: 0 }]]) })!;
    expect(b.maxX).toBeCloseTo(SELECTION_RING.haloR, 9);
    expect(b.minX).toBeCloseTo(-SELECTION_RING.haloR, 9);
  });

  it("includes the untraceable-provenance stub's reach", () => {
    const hub = node("round-1", "round-hub", 1, { label: "R1" });
    const withStub = contentBounds({
      nodes: [hub],
      stubs: [{ id: "s", nodeId: "round-1", count: 40 }],
      positions: new Map([["round-1", { x: 0, y: 0 }]]),
      hubPositions: new Map(),
      labelSides: new Map(),
    })!;
    // A hub's stub drops straight down, exactly as the canvas draws it.
    expect(withStub.maxY).toBeCloseTo(NODE_GEOMETRY["round-hub"].r + STUB_REACH, 9);
  });
});

describe("calloutAnchor: a hover callout reads inward rather than off the edge", () => {
  const frame = { x: -400, width: 800 };

  it("reads outward whenever outward fits", () => {
    expect(calloutAnchor(0, 100, 1, frame)).toBe("start");
    expect(calloutAnchor(0, 100, -1, frame)).toBe("end");
  });

  it("flips at either edge instead of letting the SVG clip the text", () => {
    expect(calloutAnchor(360, 100, 1, frame)).toBe("end");
    expect(calloutAnchor(-360, 100, -1, frame)).toBe("start");
  });

  it("keeps the specified direction when neither side can hold the text", () => {
    expect(calloutAnchor(0, 900, 1, frame)).toBe("start");
    expect(calloutAnchor(0, 900, -1, frame)).toBe("end");
  });
});

describe("hubLabelSides", () => {
  const at = (pts: [number, number, number][]) => new Map(pts.map(([r, x, y]) => [r, { x, y }] as const));

  it("keeps the specified placement above the hub by default", () => {
    expect(hubLabelSides(at([[1, 0, 0]])).get(1)).toBe("above");
    expect(hubLabelSides(at([[1, 0, 0], [2, 200, 100]])).get(1)).toBe("above");
  });

  it("moves a valley hub's label below, where the spine is not", () => {
    // The live campaign's shape: hubs zigzag, and round 2 sits at the bottom
    // of the V with both neighbours above it.
    const sides = hubLabelSides(at([
      [1, -300, 0],
      [2, -100, 130],
      [3, 100, -130],
      [4, 300, 0],
    ]));
    expect(sides.get(2)).toBe("below");
    // A peak, and both ends of the spine, keep the label above.
    expect(sides.get(1)).toBe("above");
    expect(sides.get(3)).toBe("above");
    expect(sides.get(4)).toBe("above");
  });
});

// --- Integration: the camera against real graphs, sparse and dense ---------

function campaign(rounds: number, foldedPerRound: number, proposals: number): LineageSource {
  const history = Array.from({ length: rounds }, (_, i) => ({
    round: i + 1,
    best: i === rounds - 1 ? null : 4 + i * 0.5,
    n_base: 40 + i * foldedPerRound,
  }));
  return {
    has_campaign: true,
    target: "titer",
    features: ["glucose"],
    n_base: history[history.length - 1].n_base,
    best: 6.4,
    round: rounds,
    history,
    pending: Array.from({ length: proposals }, (_, i) => ({
      id: `p-${i}`,
      recipe: { glucose: 5 + i },
      pred: 6 + i * 0.1,
      std: 0.4,
      mode: "exploit" as const,
      reason: "test",
      result: null,
      awaiting: true,
      created_at: 1_700_000_000 + i,
    })),
    n_awaiting: proposals,
    n_measured: 0,
    lineage: {
      folded_rows: Array.from({ length: foldedPerRound * (rounds - 1) }, (_, i) => ({
        run_id: `f${i}`,
        created_at: 1_600_000_000 + i * 100,
        measured_at: 1_600_000_500 + i * 100,
      })),
    },
  };
}

/** Every mark the canvas paints must land inside the frame. */
function framesEverything(graph: LineageGraph): boolean {
  const layout = layoutLineage(graph);
  const box = contentBounds({
    nodes: graph.nodes,
    stubs: graph.stubs,
    positions: layout.positions,
    hubPositions: layout.hubPositions,
    labelSides: layout.labelSides,
  });
  if (box == null) return layout.frame.width === MIN_FRAME.width;
  return (
    box.minX >= layout.frame.x &&
    box.maxX <= layout.frame.x + layout.frame.width &&
    box.minY >= layout.frame.y &&
    box.maxY <= layout.frame.y + layout.frame.height
  );
}

describe("the camera at real node counts", () => {
  it("frames an empty graph without crashing", () => {
    const empty: LineageGraph = { nodes: [], edges: [], stubs: [], runCount: 0, roundCount: 0, instrumented: { perRunLineage: false, sop: false } };
    const { frame } = layoutLineage(empty);
    expect(frame.width).toBe(MIN_FRAME.width);
    expect(frame.height).toBe(MIN_FRAME.height);
  });

  it("frames the engine's live shape (4 rounds, 6 proposals) tightly, not on the mock's canvas", () => {
    const graph = buildLineageGraph(campaign(4, 0, 6), { noiseBand: null });
    expect(graph.nodes.length).toBe(10);
    const { frame } = layoutLineage(graph);
    // The old fixed camera was 1120x620 regardless of the data. This one is
    // materially smaller, which is the whole point: a smaller frame is a
    // bigger graph on screen.
    expect(frame.width).toBeLessThan(1120);
    expect(framesEverything(graph)).toBe(true);
  });

  it("grows the frame for a dense campaign instead of overflowing it", () => {
    const graph = buildLineageGraph(campaign(9, 18, 6), { noiseBand: null });
    expect(graph.nodes.length).toBeGreaterThan(150);
    const { frame } = layoutLineage(graph);
    expect(frame.width).toBeGreaterThan(MIN_FRAME.width);
    expect(frame.height).toBeGreaterThan(MIN_FRAME.height);
    expect(framesEverything(graph)).toBe(true);
  });

  it("is deterministic: the same graph always frames identically", () => {
    const graph = buildLineageGraph(campaign(4, 6, 4), { noiseBand: null });
    expect(layoutLineage(graph).frame).toEqual(layoutLineage(graph).frame);
  });
});

describe("legendEntries", () => {
  const empty: LineageGraph = { nodes: [], edges: [], stubs: [], runCount: 0, roundCount: 0, instrumented: { perRunLineage: false, sop: false } };

  it("lists the whole vocabulary, in spec order, however sparse the graph", () => {
    expect(legendEntries(empty).map((e) => e.label)).toEqual([
      "round",
      "measured run",
      "round best",
      "failed run",
      "proposed",
      "unnamed provenance",
    ]);
  });

  it("marks every entry absent when the graph is empty", () => {
    expect(legendEntries(empty).every((e) => !e.present)).toBe(true);
  });

  it("lights up exactly the marks today's engine can produce, from the node set", () => {
    const graph = buildLineageGraph(campaign(4, 0, 6), { noiseBand: null });
    const by = new Map(legendEntries(graph).map((e) => [e.label, e.present] as const));
    expect(by.get("round")).toBe(true);
    expect(by.get("proposed")).toBe(true);
    // Untraceable base rows exist, so the stub mark is real.
    expect(by.get("unnamed provenance")).toBe(true);
    // The engine discards run ids on fold and models no failure status.
    expect(by.get("measured run")).toBe(false);
    expect(by.get("round best")).toBe(false);
    expect(by.get("failed run")).toBe(false);
  });

  it("lights a mark as soon as a node of that kind appears, with no list to update", () => {
    const graph: LineageGraph = { ...empty, nodes: [node("x", "failed-run", 1), node("b", "round-best", 1)] };
    const by = new Map(legendEntries(graph).map((e) => [e.label, e.present] as const));
    expect(by.get("failed run")).toBe(true);
    expect(by.get("round best")).toBe(true);
    expect(by.get("round")).toBe(false);
  });
});
