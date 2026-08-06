// The Lineage lens's layout engine: a real d3-force simulation, run to
// settle ONCE and then frozen.
//
// Why frozen: a graph that re-solves on every React render visibly jitters,
// and a node that moves under the pointer between a hover and a click is a
// bug, not an animation. So the simulation is ticked headlessly here (never
// via d3's internal timer, so nothing animates and `prefers-reduced-motion`
// is satisfied by construction), the settled coordinates are returned as
// plain numbers, and the caller memoises on the graph's structural signature
// - see `layoutSignature`. Re-running only ever happens when the NODE SET
// itself changes; selection, hover, zoom, and replay scrubbing never touch it.
//
// Determinism: d3-force seeds unpositioned nodes on a phyllotaxis spiral and
// jiggles coincident ones with Math.random. Both are sidestepped by giving
// every node an explicit, computed starting position (its ring anchor), so
// the same graph always settles to the same layout - a layout that changed
// between two loads of the same campaign would be its own kind of dishonesty.
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { NODE_GEOMETRY, type HubLabelSide } from "./geometry";
import { contentBounds, fitViewBox, type ViewFrame } from "./frame";
import type { LineageGraph, MapNode } from "../map-types";

export type Point = { x: number; y: number };

export type LineageLayout = {
  positions: Map<string, Point>;
  hubPositions: Map<number, Point>;
  /** Which side of its hub each round's name + sub-caption is drawn on. See
   *  `hubLabelSides` - the renderer and the ring-anchor wedge both read this,
   *  so a label can never be placed where the ring reserved no room. */
  labelSides: Map<number, HubLabelSide>;
  /** The viewBox the canvas should look through: the settled content's own
   *  bounding box (labels and callouts included), padded and clamped. See
   *  ./frame.ts - the camera is derived from the data, not fixed to the
   *  design mock's canvas size. */
  frame: ViewFrame;
};

/** Cheap structural fingerprint of the graph. Changes only when the node or
 *  edge SET changes - not when a value, label, or selection does - so it is
 *  exactly the right memo key for "re-run the simulation". */
export function layoutSignature(graph: LineageGraph): string {
  const nodes = graph.nodes.map((n) => `${n.id}:${n.kind}:${n.round}`).sort();
  const edges = graph.edges.map((e) => e.id).sort();
  return `${nodes.join("|")}#${edges.join("|")}`;
}

type SimNode = SimulationNodeDatum & {
  id: string;
  round: number;
  radius: number;
  isHub: boolean;
  anchor: Point;
};

const HUB_SPACING = 200;
/** Vertical swing of the spine. Tuned against the real canvas, not guessed:
 *  at 78 the settled bounding box was roughly 950x280, so the fit transform
 *  was limited by width and the graph occupied under half the viewBox's
 *  height. A taller swing spends the vertical space the 1120x620 viewBox
 *  already reserves, and pushes adjacent cluster rings further apart. */
const HUB_AMPLITUDE = 150;
const RING_MIN = 60;
/** Angular wedge left empty at the top of every cluster ring so the round's
 *  name and sub-caption (drawn above the hub, per DESIGN_SPEC.md 3.2) never
 *  sit on top of a run node. 80 degrees total = the README's +/-40. */
const TOP_GAP_RAD = (80 * Math.PI) / 180;
/** Per-node arc budget on a ring: node diameter plus breathing room. */
const ARC_PER_NODE = 21;

function hubLayout(rounds: readonly number[]): Map<number, Point> {
  const out = new Map<number, Point>();
  const n = Math.max(1, rounds.length);
  const totalWidth = (n - 1) * HUB_SPACING;
  rounds.forEach((round, i) => {
    out.set(round, {
      x: -totalWidth / 2 + i * HUB_SPACING,
      // A deterministic gentle zigzag rather than a flat line: it gives the
      // spine a readable direction and keeps adjacent rings from merging.
      y: HUB_AMPLITUDE * Math.sin((i * 2 * Math.PI) / 3),
    });
  });
  return out;
}

function ringRadius(childCount: number): number {
  const usableArc = 2 * Math.PI - TOP_GAP_RAD;
  return Math.max(RING_MIN, (childCount * ARC_PER_NODE) / usableArc);
}

/** Where each round's name + sub-caption goes.
 *
 *  Default is above the hub, per DESIGN_SPEC.md 3.2. The exception is a hub
 *  sitting in a VALLEY of the zigzag spine - one with hubs on both sides of
 *  it, both higher up. The spine's own two segments then form a "V" whose
 *  arms sweep up through exactly the band the label occupies, and the label
 *  and the edge cross. (Observed on the live campaign: round 2's
 *  "22 runs folded" sat on the round-1 spine segment.) A peak hub, or either
 *  end of the spine, has clear air above it and keeps the specified
 *  placement. */
export function hubLabelSides(hubPositions: ReadonlyMap<number, Point>): Map<number, HubLabelSide> {
  const rounds = [...hubPositions.keys()].sort((a, b) => a - b);
  const out = new Map<number, HubLabelSide>();
  rounds.forEach((round, i) => {
    const here = hubPositions.get(round) as Point;
    const left = i > 0 ? hubPositions.get(rounds[i - 1]) : undefined;
    const right = i < rounds.length - 1 ? hubPositions.get(rounds[i + 1]) : undefined;
    const valley = left != null && right != null && left.y < here.y && right.y < here.y;
    out.set(round, valley ? "below" : "above");
  });
  return out;
}

/** Anchor every child of a round on its ring, evenly spread across the arc
 *  that remains once the LABEL's wedge is excluded. Deterministic in node
 *  order, which the builder emits in a stable order (hubs, folded runs by
 *  round, then pending runs).
 *
 *  The wedge follows the label, not the compass: a round whose caption moved
 *  below its hub reserves its empty arc at the bottom. Keeping the gap pinned
 *  to the top would move the collision rather than fix it. */
function ringAnchors(children: readonly MapNode[], hub: Point, side: HubLabelSide): Map<string, Point> {
  const out = new Map<string, Point>();
  const radius = ringRadius(children.length);
  const start = (side === "below" ? Math.PI / 2 : -Math.PI / 2) + TOP_GAP_RAD / 2;
  const usableArc = 2 * Math.PI - TOP_GAP_RAD;
  children.forEach((child, i) => {
    const theta = start + ((i + 0.5) / Math.max(1, children.length)) * usableArc;
    out.set(child.id, { x: hub.x + radius * Math.cos(theta), y: hub.y + radius * Math.sin(theta) });
  });
  return out;
}

/** Link distance/strength per edge kind. The spine is between pinned hubs so
 *  its numbers never bite; hub-to-run holds a node on its own ring; descent
 *  and neighbour links are deliberately weak, so real ancestry bends the
 *  layout without dragging a node out of the round it belongs to. */
const LINK_SPEC: Record<string, { distance: number; strength: number }> = {
  "round-spine": { distance: HUB_SPACING, strength: 0 },
  "hub-to-run": { distance: RING_MIN, strength: 0.22 },
  "run-neighbour": { distance: 34, strength: 0.09 },
  "cross-round-descent": { distance: 150, strength: 0.012 },
};

const TICKS = 320;

export function layoutLineage(graph: LineageGraph): LineageLayout {
  const hubs = graph.nodes.filter((n) => n.kind === "round-hub" || n.kind === "round-hub-open").sort((a, b) => a.round - b.round);
  const hubPositions = hubLayout(hubs.map((h) => h.round));
  const labelSides = hubLabelSides(hubPositions);

  const anchors = new Map<string, Point>();
  for (const hub of hubs) {
    const hubPoint = hubPositions.get(hub.round) ?? { x: 0, y: 0 };
    anchors.set(hub.id, hubPoint);
    const children = graph.nodes.filter((n) => n.round === hub.round && n.id !== hub.id && !isHubKind(n));
    for (const [id, point] of ringAnchors(children, hubPoint, labelSides.get(hub.round) ?? "above")) anchors.set(id, point);
  }
  // Any node whose round has no hub (shouldn't happen with engine data, but
  // never crash on it) anchors at the origin rather than being dropped.
  for (const n of graph.nodes) if (!anchors.has(n.id)) anchors.set(n.id, { x: 0, y: 0 });

  const simNodes: SimNode[] = graph.nodes.map((n) => {
    const anchor = anchors.get(n.id) as Point;
    const isHub = isHubKind(n);
    return {
      id: n.id,
      round: n.round,
      radius: NODE_GEOMETRY[n.kind].r,
      isHub,
      anchor,
      x: anchor.x,
      y: anchor.y,
      // Hubs are pinned: the spine is the graph's spatial argument (rounds
      // advance left to right in time) and letting forces move it would
      // destroy the one axis the reader can rely on.
      ...(isHub ? { fx: anchor.x, fy: anchor.y } : {}),
    };
  });

  const byId = new Map(simNodes.map((n) => [n.id, n] as const));
  const links: SimulationLinkDatum<SimNode>[] = graph.edges
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)!, ...(LINK_SPEC[e.kind] ?? LINK_SPEC["run-neighbour"]) }));

  const sim = forceSimulation(simNodes)
    .force(
      "link",
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((d) => d.id)
        .distance((l) => (l as { distance?: number }).distance ?? 60)
        .strength((l) => (l as { strength?: number }).strength ?? 0.1),
    )
    .force("charge", forceManyBody<SimNode>().strength((d) => (d.isHub ? -260 : -46)))
    .force("collide", forceCollide<SimNode>((d) => d.radius + 7).strength(0.9))
    // The per-round clustering force: every node is sprung back to its own
    // ring anchor, which is what keeps rounds as visually distinct clusters
    // rather than one merged cloud.
    .force("cluster-x", forceX<SimNode>((d) => d.anchor.x).strength((d) => (d.isHub ? 1 : 0.16)))
    .force("cluster-y", forceY<SimNode>((d) => d.anchor.y).strength((d) => (d.isHub ? 1 : 0.16)))
    .stop();

  // Headless settle. No d3 timer is ever started, so this never animates and
  // never schedules work after the call returns.
  for (let i = 0; i < TICKS; i++) sim.tick();
  sim.stop();

  const positions = new Map<string, Point>();
  for (const n of simNodes) positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });

  const frame = fitViewBox(contentBounds({ nodes: graph.nodes, stubs: graph.stubs, positions, hubPositions, labelSides }));
  return { positions, hubPositions, labelSides, frame };
}

function isHubKind(n: MapNode): boolean {
  return n.kind === "round-hub" || n.kind === "round-hub-open";
}

