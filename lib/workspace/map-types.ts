// Domain types for the Map tab's Lineage lens (design spec section 3a).
//
// Deliberately NOT added to ./types.ts - that module is owned by the Log
// tab build happening in parallel on this branch, and its `Run`/`Round`/
// `Campaign` shapes are intentionally generic (no timestamps, no ancestry).
// The Lineage lens needs per-run `created_at`/`measured_at` (for the replay
// footer's real-date ticks) and per-run `parent_ids`/`parent_row_count` (for
// the traceable-vs-total honesty requirement) that the shared domain types
// do not and should not carry. See lib/workspace/graph/lineage-adapter.ts
// for where these types get populated - a second, narrower seam alongside
// ./adapter.ts, not a replacement for it.
//
// See DESIGN_SPEC.md section 3.2 for the node/edge vocabulary this models,
// and the Map-tab build report for how "traceable vs total" is represented.

export type MapNodeKind =
  | "round-hub"
  | "round-hub-open"
  | "measured-run"
  | "round-best"
  | "failed-run"
  | "proposal"
  | "sop";

/** `sop-governance` is the local-graph lens's dashed SOP link (DESIGN_SPEC.md
 *  5.2). Like the `sop` node kind it is part of the vocabulary and fully
 *  rendered, but nothing emits it: kalos models no SOP or governance concept,
 *  so `LineageGraph.instrumented.sop` is false and the edge set is empty. The
 *  kind exists so the day an engine reports governance the renderer already
 *  knows how to draw it, not so the dashboard can draw one today. */
export type MapEdgeKind = "round-spine" | "hub-to-run" | "run-neighbour" | "cross-round-descent" | "sop-governance";

/** One node in the Lineage lens graph. `x`/`y` are simulation output (see
 *  lib/workspace/graph/simulation.ts) - callers should treat them as unset
 *  (0,0) until the simulation has run once. */
export type MapNode = {
  id: string;
  kind: MapNodeKind;
  /** Round this node belongs to. Round-hub nodes use their own round
   *  number; every other node uses the round it was proposed/measured in. */
  round: number;
  label: string;
  sublabel: string | null;
  /** The measured or predicted objective value, when known. Null for a
   *  hub whose round has no measured/predicted value yet. */
  value: number | null;
  band: number | null;
  recipe: Record<string, number> | null;
  mode: "explore" | "exploit" | null;
  createdAtMs: number | null;
  measuredAtMs: number | null;
  /** How many rows this run's proposal descended from, split into the
   *  subset the engine can actually name (`traceableIds`) and the true
   *  total (`totalCount`). `totalCount` is null when the engine reports no
   *  lineage at all for this run (today's default - see
   *  lineage-adapter.ts). `totalCount` is almost always > traceableIds.length
   *  - the gap is real, untraceable provenance, never inferred or padded. */
  provenance: { traceableIds: string[]; totalCount: number | null } | null;
  x: number;
  y: number;
  /** Set once the simulation has fixed this node in place (always true for
   *  round hubs, which are pinned; true for every node after freeze). */
  fixed: boolean;
};

export type MapEdge = {
  id: string;
  kind: MapEdgeKind;
  source: string;
  target: string;
};

/** A non-edge decoration: a short stub radiating from a run node, standing
 *  in for provenance the engine cannot name. Never terminates at a real (or
 *  fabricated) node - see build-lineage.ts's "traceable vs total" handling.
 *  Deliberately has no position/angle of its own: the canvas computes where
 *  to point it (away from the node's real parent edges) once the simulation
 *  has settled, since that direction depends on final node coordinates
 *  build-lineage.ts does not have. */
export type UntraceableStub = {
  id: string;
  nodeId: string;
  count: number;
};

export type LineageGraph = {
  nodes: MapNode[];
  edges: MapEdge[];
  stubs: UntraceableStub[];
  runCount: number;
  roundCount: number;
  /** Honest capability flags - drive "not instrumented" UI states instead
   *  of a component silently rendering nothing with no explanation. */
  instrumented: {
    /** True if at least one node carries real parent_ids/parent_row_count. */
    perRunLineage: boolean;
    /** SOP nodes are never instrumented today - kalos has no SOP concept.
     *  Always false; kept as a field (not a hardcoded `false` at every call
     *  site) so a future engine addition only has to flip this in one
     *  place, in lineage-adapter.ts. */
    sop: boolean;
  };
};

export type MapLens = "lineage" | "interactions" | "surface";
