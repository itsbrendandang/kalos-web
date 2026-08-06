// The local-graph lens: "Around Run N" (DESIGN_SPEC.md section 5.2).
//
// Pure, headless, and deterministic - no React, no DOM, no simulation. Unlike
// the whole-campaign Lineage lens (which settles a d3-force layout once and
// freezes it), a local graph is small and radial by construction: the centre
// run, a depth-1 ring, a depth-2 ring. Concentric rings ARE the layout, so
// solving for them with a force simulation would only add jitter and a random
// seed to something with an exact answer.
//
// WHAT THIS MODULE REFUSES TO DO, and why the refusals are the feature:
//
//   1. It never invents a centre. `runRootCandidates` returns only nodes that
//      are individually nameable RUNS. Today's kalos discards a run's id the
//      moment it folds the run into the base data, so on a live campaign that
//      list is usually empty - and an empty list is the primary case, not an
//      edge case. The caller renders the reason; it does not root on a round
//      hub or a proposal to have something to draw.
//
//   2. It never fakes the node-size encoding. Node radius is supposed to be
//      descendant count (the Obsidian "more references, bigger node" rule).
//      When the engine reports descent round-by-round rather than run-by-run -
//      which is what it does today - no run has a countable descendant set,
//      and `descendantIndex` says so instead of handing back zeros. A uniform
//      radius that reads as an encoding is worse than a uniform radius that is
//      labelled as one.
import { hopDistances } from "./neighborhood";
import { fitViewBox, type Bounds, type ViewFrame } from "./frame";
import {
  LOCAL_GRAPH,
  NODE_GEOMETRY,
  TEXT_ASCENT,
  TEXT_DESCENT,
  estimateTextWidth,
  radiusFromDescendants,
} from "./geometry";
import type { LineageGraph, MapEdge, MapNode } from "../map-types";

export type Point = { x: number; y: number };

/** Node kinds that stand for one individually nameable run. A proposal is a
 *  recipe nobody has executed, and a round hub is a group, so neither can be
 *  the "Run N" a local graph is centred on. */
const ROOT_KINDS = new Set<MapNode["kind"]>(["measured-run", "round-best", "failed-run"]);

export function isHubKind(kind: MapNode["kind"]): boolean {
  return kind === "round-hub" || kind === "round-hub-open";
}

/** Every run this campaign can name, most recently measured first. Empty on
 *  today's engine for almost every campaign - see the module header. */
export function runRootCandidates(graph: LineageGraph): MapNode[] {
  return graph.nodes
    .filter((n) => ROOT_KINDS.has(n.kind))
    .sort((a, b) => (b.measuredAtMs ?? 0) - (a.measuredAtMs ?? 0) || a.label.localeCompare(b.label));
}

export type DescendantIndex = {
  /** True when descendant counts are a real quantity for this graph. */
  countable: boolean;
  /** Transitive descendant count per node id. Only meaningful when
   *  `countable` - otherwise every entry is zero and must not be drawn. */
  counts: Map<string, number>;
  /** Why counting is impossible, when it is. Rendered verbatim. */
  reason: string | null;
};

/** Transitive descendants over the graph's directed lineage edges.
 *
 *  `countable` is the load-bearing field. It is true only when at least one
 *  descent edge starts at an individual RUN. When every descent edge starts at
 *  a round hub - which is what build-lineage.ts emits when a proposal names
 *  all of a round's rows, i.e. the normal case today - then "how many runs
 *  descend from this one" has no per-run answer: every run in the round would
 *  score identically, and sizing nodes by it would draw a difference that does
 *  not exist. */
export function descendantIndex(graph: LineageGraph): DescendantIndex {
  const descent = graph.edges.filter((e) => e.kind === "cross-round-descent");
  const kindById = new Map(graph.nodes.map((n) => [n.id, n.kind] as const));
  const runLevel = descent.some((e) => {
    const kind = kindById.get(e.source);
    return kind != null && !isHubKind(kind);
  });

  const children = new Map<string, string[]>();
  for (const e of descent) {
    const list = children.get(e.source);
    if (list) list.push(e.target);
    else children.set(e.source, [e.target]);
  }

  const counts = new Map<string, number>();
  const reach = new Map<string, Set<string>>();
  const walking = new Set<string>();
  function descendantsOf(id: string): Set<string> {
    const cached = reach.get(id);
    if (cached) return cached;
    if (walking.has(id)) return new Set();
    walking.add(id);
    const out = new Set<string>();
    for (const child of children.get(id) ?? []) {
      out.add(child);
      for (const deeper of descendantsOf(child)) out.add(deeper);
    }
    walking.delete(id);
    out.delete(id);
    reach.set(id, out);
    return out;
  }
  for (const node of graph.nodes) counts.set(node.id, runLevel ? descendantsOf(node.id).size : 0);

  if (runLevel) return { countable: true, counts, reason: null };
  return {
    countable: false,
    counts,
    reason:
      descent.length === 0
        ? "The engine reports no ancestry for any node here, so nothing descends from anything it can name. Node size carries no meaning on this canvas and every node is drawn at the same size."
        : "Descent is reported round by round, not run by run, so every run in a round has the same ancestors and the same descendants. There is no per-run count to size nodes by, so they are all drawn the same size.",
  };
}

/** The radius a node is drawn at. Round hubs keep their vocabulary radius (a
 *  hub is not a run and its size is not a count), the centre is fixed by the
 *  spec, and everything else is the descendant formula - but only when the
 *  count is real. `scale` is the Display panel's node-size slider. */
export function localRadius(node: MapNode, index: DescendantIndex, scale: number, isCentre: boolean): number {
  if (isCentre) return LOCAL_GRAPH.centreR;
  if (isHubKind(node.kind)) return NODE_GEOMETRY[node.kind].r * scale;
  const base = index.countable ? radiusFromDescendants(index.counts.get(node.id) ?? 0) : NODE_GEOMETRY[node.kind].r;
  return base * scale;
}

export type LocalGraphNode = {
  node: MapNode;
  /** BFS distance from the centre: 0 is the centre itself. */
  hop: number;
  radius: number;
  x: number;
  y: number;
};

export type LocalGraphLayout = {
  root: MapNode;
  nodes: LocalGraphNode[];
  /** Edges with BOTH endpoints inside the neighbourhood. */
  edges: MapEdge[];
  positions: Map<string, Point>;
  radii: Map<string, number>;
  frame: ViewFrame;
  /** How many nodes sit on each ring, index 0 = the centre. */
  ringCounts: number[];
  descendants: DescendantIndex;
};

export type LocalGraphOptions = {
  depth: number;
  linkDistance: number;
  clusterByRound: number;
  nodeSize: number;
  /** Node ids allowed into the graph. Null means no filter is active. The
   *  centre is always kept regardless - a local graph with no centre is not a
   *  filtered graph, it is a broken one. */
  allowedIds: Set<string> | null;
  descendants: DescendantIndex;
  /** Reserve room on the right for the floating settings panel, so the graph
   *  sits clear of it instead of underneath it. */
  reserveRight: boolean;
};

/** Arc budget per node on a ring: enough room for the disc plus the mono
 *  label hung under it. Generous on purpose - the mock's 17-node graph never
 *  tested a crowded ring, and a real depth-2 neighbourhood can carry fifty
 *  nodes whose labels would otherwise stack on top of each other. */
const ARC_PER_NODE = 40;

/** Depth-1 sits at `linkDistance`; each further ring adds 85% of it again.
 *  With the default 120 that gives 120 / 222 / 324, which brackets the mock's
 *  hand-placed "≈130" and "≈240" (DESIGN_SPEC.md gap list #8 explicitly warns
 *  those two numbers are approximate and must not be reverse-engineered into
 *  false precision).
 *
 *  A ring never sits closer in than its own contents need: `count` pushes the
 *  radius out until every node on it has ARC_PER_NODE of arc to itself. The
 *  camera reframes to suit (see ./frame.ts), so a crowded ring costs scale,
 *  not legibility. */
export function ringRadius(hop: number, linkDistance: number, count = 0, cluster = 0): number {
  if (hop <= 0) return 0;
  const base = linkDistance * (1 + (hop - 1) * 0.85);
  // Clustering tightens each round's wedge, so the arc a node actually gets is
  // smaller than an even share by exactly that factor. Compensating here is
  // what stops "Cluster by round" from turning into "make the labels collide".
  const tightness = Math.min(1, Math.max(0, cluster)) * 0.55;
  const needed = (count * ARC_PER_NODE) / (2 * Math.PI) / (1 - tightness);
  return Math.max(base, needed);
}

/** Angles for one ring.
 *
 *  Nodes are sorted by round before this runs, so each round already occupies
 *  a contiguous arc. `cluster` then compresses each round's members toward the
 *  centre of their own arc: at 0 the ring is an even spread, at 1 each round
 *  reads as a tight wedge. Compressing within an existing share means rings
 *  never re-order and two rounds can never swap places, so the layout stays
 *  stable while the slider moves. */
export function ringAngles(rounds: readonly number[], cluster: number): number[] {
  const n = rounds.length;
  if (n === 0) return [];
  const start = -Math.PI / 2;
  const step = (2 * Math.PI) / n;
  const tightness = Math.min(1, Math.max(0, cluster)) * 0.55;

  // Contiguous index span of each round group, keyed by the group's first index.
  const spans: { from: number; to: number }[] = [];
  let from = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || rounds[i] !== rounds[from]) {
      spans.push({ from, to: i });
      from = i;
    }
  }

  const angles = new Array<number>(n);
  for (const span of spans) {
    const shareCentre = start + ((span.from + span.to) / 2) * step;
    for (let i = span.from; i < span.to; i++) {
      const even = start + (i + 0.5) * step;
      angles[i] = shareCentre + (even - shareCentre) * (1 - tightness);
    }
  }
  return angles;
}

function labelBounds(b: Bounds, cx: number, baselineY: number, width: number, fontPx: number): void {
  const x0 = cx - width / 2;
  if (x0 < b.minX) b.minX = x0;
  if (x0 + width > b.maxX) b.maxX = x0 + width;
  const top = baselineY - fontPx * TEXT_ASCENT;
  const bottom = baselineY + fontPx * TEXT_DESCENT;
  if (top < b.minY) b.minY = top;
  if (bottom > b.maxY) b.maxY = bottom;
}

/** Fraction of the content's own width reserved to the right of the graph
 *  when the settings panel is open. Taken from the mock's proportions: the
 *  3c canvas is 820 units wide, its content spans roughly 480 of them, and
 *  the panel covers the remaining ~280 - so the reserve is a little over half
 *  the content width. Proportional rather than absolute because the SVG
 *  scales to its container and the panel does not. */
const PANEL_RESERVE = 0.58;

export function layoutLocalGraph(graph: LineageGraph, rootId: string, opts: LocalGraphOptions): LocalGraphLayout | null {
  const root = graph.nodes.find((n) => n.id === rootId);
  if (!root) return null;

  // Filter the EDGE set before the BFS, not the node set after it: a node
  // excluded by the filters must not go on acting as a bridge that pulls in
  // things two hops away through a link the reader cannot see.
  const allowed = (id: string) => id === rootId || opts.allowedIds == null || opts.allowedIds.has(id);
  const usableEdges = graph.edges.filter((e) => allowed(e.source) && allowed(e.target));

  const hops = hopDistances(rootId, usableEdges, Math.max(0, opts.depth));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));

  const byHop = new Map<number, MapNode[]>();
  for (const [id, hop] of hops) {
    const node = nodeById.get(id);
    if (!node) continue;
    const list = byHop.get(hop);
    if (list) list.push(node);
    else byHop.set(hop, [node]);
  }

  const positions = new Map<string, Point>();
  const radii = new Map<string, number>();
  const nodes: LocalGraphNode[] = [];
  const ringCounts: number[] = [];

  for (let hop = 0; hop <= opts.depth; hop++) {
    const ring = (byHop.get(hop) ?? []).slice().sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
    ringCounts[hop] = ring.length;
    if (ring.length === 0) continue;

    if (hop === 0) {
      const radius = localRadius(root, opts.descendants, opts.nodeSize, true);
      positions.set(root.id, { x: 0, y: 0 });
      radii.set(root.id, radius);
      nodes.push({ node: root, hop: 0, radius, x: 0, y: 0 });
      continue;
    }

    const r = ringRadius(hop, opts.linkDistance, ring.length, opts.clusterByRound);
    const angles = ringAngles(ring.map((n) => n.round), opts.clusterByRound);
    ring.forEach((node, i) => {
      const point = { x: r * Math.cos(angles[i]), y: r * Math.sin(angles[i]) };
      const radius = localRadius(node, opts.descendants, opts.nodeSize, false);
      positions.set(node.id, point);
      radii.set(node.id, radius);
      nodes.push({ node, hop, radius, ...point });
    });
  }

  const edges = usableEdges.filter((e) => positions.has(e.source) && positions.has(e.target));

  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const entry of nodes) {
    const reach = entry.hop === 0 ? Math.max(entry.radius, LOCAL_GRAPH.haloR) : entry.radius;
    if (entry.x - reach < bounds.minX) bounds.minX = entry.x - reach;
    if (entry.x + reach > bounds.maxX) bounds.maxX = entry.x + reach;
    if (entry.y - reach < bounds.minY) bounds.minY = entry.y - reach;
    if (entry.y + reach > bounds.maxY) bounds.maxY = entry.y + reach;

    if (entry.hop === 0) {
      labelBounds(
        bounds,
        entry.x,
        entry.y + LOCAL_GRAPH.centreLabelDy,
        estimateTextWidth(entry.node.label, LOCAL_GRAPH.centreLabelFontPx, true),
        LOCAL_GRAPH.centreLabelFontPx,
      );
    } else {
      labelBounds(
        bounds,
        entry.x,
        entry.y + entry.radius + LOCAL_GRAPH.nodeLabelGap,
        estimateTextWidth(entry.node.label, LOCAL_GRAPH.nodeLabelFontPx, true),
        LOCAL_GRAPH.nodeLabelFontPx,
      );
    }
  }

  if (opts.reserveRight && Number.isFinite(bounds.minX)) {
    bounds.maxX += (bounds.maxX - bounds.minX) * PANEL_RESERVE;
  }

  return {
    root,
    nodes,
    edges,
    positions,
    radii,
    frame: fitViewBox(Number.isFinite(bounds.minX) ? bounds : null, { padding: 24, min: { width: 820, height: 600 } }),
    ringCounts,
    descendants: opts.descendants,
  };
}

/** The footer's Newsreader read of the neighbourhood. Every clause is a count
 *  taken from the layout that is on screen; when the honest answer is "node
 *  size means nothing here", that is the last sentence rather than an omission.
 */
export function localNarrative(layout: LocalGraphLayout): string {
  const first = layout.ringCounts[1] ?? 0;
  const beyond = layout.ringCounts.slice(2).reduce((a, b) => a + (b ?? 0), 0);
  const proposals = layout.nodes.filter((n) => n.node.kind === "proposal").length;

  const sentences: string[] = [];
  if (first === 0) {
    sentences.push(`Nothing links to ${layout.root.label}. It sits on its own in this campaign's lineage.`);
  } else {
    const tail = beyond > 0 ? `, and ${beyond} more further out` : "";
    sentences.push(
      `${layout.root.label} touches ${first} node${first === 1 ? "" : "s"} directly${tail}.`,
    );
  }
  if (proposals > 0) {
    sentences.push(`${proposals} of them ${proposals === 1 ? "is a recipe" : "are recipes"} the model has proposed and nobody has run yet.`);
  }
  if (!layout.descendants.countable && layout.descendants.reason) {
    sentences.push(layout.descendants.reason);
  }
  return sentences.join(" ");
}
