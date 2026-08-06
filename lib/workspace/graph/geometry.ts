// Pure geometry/style lookups for the Map tab's graphs. No React, no DOM -
// kept pure so it is trivially unit-testable (see __tests__/map-geometry.test.ts)
// and reusable by whichever lens needs it. Every color is a CSS custom
// property reference (`var(--token)`), never a literal hex, matching the
// house pattern in components/charts.tsx's CHART_THEME - React/SVG pass
// these strings straight through to `fill`/`stroke` attributes, and the
// browser resolves them against whatever `.dark` currently applies.
import type { MapEdgeKind, MapNodeKind } from "../map-types";

export type NodeGeometry = {
  r: number;
  fill: string;
  stroke: string | null;
  strokeWidth: number;
  dashArray: string | null;
  /** Text color for the node's own inline numeral (round hubs only). */
  textFill: string | null;
  /** Halo (paint-order stroke) color behind labels for this node kind. Per
   *  DESIGN_SPEC.md 3.2's halo exception: a label painted white-on-dark
   *  (the round-hub numeral) must halo with the disc's own fill, not the
   *  surface color, or the halo reads as a white blob on top of the disc. */
  labelHalo: string;
};

/** Selection-ring geometry, drawn as an overlay on top of whichever node is
 *  selected (selection is UI state, not a distinct data kind - see
 *  map-types.ts). Matches DESIGN_SPEC.md's "Selected" row. */
export const SELECTION_RING = {
  r: 8,
  stroke: "var(--action)",
  strokeWidth: 1.8,
  haloR: 16,
  haloDashArray: "2 3",
  haloStrokeWidth: 1,
};

/** Halo color for any label drawn OUTSIDE a node disc, i.e. sitting directly
 *  on the canvas surface. A token, not a literal, because the canvas surface
 *  flips with the theme - a hardcoded white halo would paint a bright blob
 *  behind every label in dark mode. */
export const LABEL_HALO_SURFACE = "var(--card)";

/** Which side of its hub a round's name + sub-caption is drawn on. A hub
 *  sitting in a valley of the spine (both neighbouring hubs above it) has
 *  the spine's own "V" running straight through the space above it, so its
 *  label moves below instead - see `hubLabelSides` in ./simulation.ts, which
 *  is the single place the choice is made for both the renderer AND the
 *  ring-anchor wedge, so the two can never disagree. */
export type HubLabelSide = "above" | "below";

/** Hub label placement, as text-baseline offsets in LAYOUT units from the hub
 *  centre. Exported (rather than inlined in the canvas) because the camera
 *  has to know how far a label reaches past its disc to frame the graph - see
 *  ./frame.ts. The `above` numbers are DESIGN_SPEC.md 3.2's hubY-46 / hubY-31;
 *  `below` mirrors them at the same visual gap from the r=17 disc edge, with
 *  the name still reading first. */
export const HUB_LABEL = {
  above: { name: -46, sub: -31 },
  below: { name: 40, sub: 55 },
  nameFontPx: 11.5,
  subFontPx: 11.5,
} as const;

/** Per-run callout placement (see `RunCallout` in the canvas). */
export const RUN_CALLOUT = {
  /** Radial gap past the node edge, and the wider gap used when the node also
   *  carries an untraceable-provenance stub that must not be written over. */
  gap: 8,
  gapWithStub: 24,
  /** Baseline offsets from the callout anchor point. */
  baselineDy: 3,
  secondLineDy: 15,
  fontPx: 10.5,
  secondFontPx: 10,
} as const;

/** How far an untraceable-provenance stub reaches past the node edge. */
export const STUB_REACH = 18;

/** Rough per-character advance as a fraction of font size, used ONLY to
 *  estimate how much room a label needs when framing the camera. There is no
 *  DOM at layout time (the simulation is headless and unit-tested in node),
 *  so measured text metrics are not available; these are deliberate
 *  OVER-estimates of IBM Plex Mono's fixed 0.6em advance and of the sans
 *  stack's average, because a camera that reserves slightly too much room
 *  crops nothing, while one that reserves too little clips a label. */
export const MONO_ADVANCE = 0.62;
export const SANS_ADVANCE = 0.56;

/** Cap height above, and descender below, a text baseline - again as a
 *  fraction of font size, and again deliberately generous. */
export const TEXT_ASCENT = 0.82;
export const TEXT_DESCENT = 0.26;

export function estimateTextWidth(text: string, fontPx: number, mono: boolean): number {
  return text.length * fontPx * (mono ? MONO_ADVANCE : SANS_ADVANCE);
}

const SURFACE_HALO = LABEL_HALO_SURFACE;

export const NODE_GEOMETRY: Record<MapNodeKind, NodeGeometry> = {
  "round-hub": {
    r: 17,
    fill: "var(--action)",
    stroke: null,
    strokeWidth: 0,
    dashArray: null,
    textFill: "white",
    labelHalo: "var(--action)",
  },
  "round-hub-open": {
    r: 17,
    fill: "var(--card)",
    stroke: "var(--action)",
    strokeWidth: 1.8,
    dashArray: "4.5 4",
    textFill: "var(--fg)",
    labelHalo: SURFACE_HALO,
  },
  "measured-run": {
    r: 6.5,
    fill: "var(--card)",
    stroke: "var(--node-stroke)",
    strokeWidth: 1.2,
    dashArray: null,
    textFill: null,
    labelHalo: SURFACE_HALO,
  },
  "round-best": {
    r: 9,
    fill: "var(--green)",
    stroke: "var(--green)",
    strokeWidth: 1,
    dashArray: null,
    textFill: null,
    labelHalo: SURFACE_HALO,
  },
  "failed-run": {
    r: 6.5,
    fill: "var(--card)",
    stroke: "var(--amber)",
    strokeWidth: 1.5,
    dashArray: null,
    textFill: null,
    labelHalo: SURFACE_HALO,
  },
  proposal: {
    r: 7.5,
    fill: "var(--card)",
    stroke: "var(--action)",
    strokeWidth: 1.5,
    dashArray: "3 2.8",
    textFill: null,
    labelHalo: SURFACE_HALO,
  },
  sop: {
    r: 12,
    fill: "var(--card)",
    stroke: "var(--node-stroke)",
    strokeWidth: 1.3,
    dashArray: "3 3",
    textFill: "var(--muted)",
    labelHalo: SURFACE_HALO,
  },
};

export type EdgeGeometry = { stroke: string; strokeWidth: number; dashArray: string | null };

export const EDGE_GEOMETRY: Record<MapEdgeKind, EdgeGeometry> = {
  "round-spine": { stroke: "var(--action)", strokeWidth: 1.8, dashArray: null },
  "hub-to-run": { stroke: "var(--border)", strokeWidth: 1.1, dashArray: null },
  "run-neighbour": { stroke: "var(--edge-faint)", strokeWidth: 1, dashArray: null },
  "cross-round-descent": { stroke: "var(--node-stroke)", strokeWidth: 1, dashArray: "4 4" },
  // The mock draws governance in #3b5b8c. DESIGN.md's "Color roles" section
  // rejected that hue outright: chrome stays achromatic, only data-viz keeps
  // colour, and SOP marks are separated from ordinary line-art by SHAPE AND
  // WEIGHT instead - a heavier dashed stroke on --node-stroke. That decision
  // is already recorded for the SOP node and the SOP citation card; the
  // governance edge follows it rather than reopening it.
  "sop-governance": { stroke: "var(--node-stroke)", strokeWidth: 1.6, dashArray: "4 4" },
};

/** The final spine segment (into the still-open round) dashes instead of
 *  solid - the exact same hub-to-hub relationship as every other
 *  `round-spine` edge, with one attribute overridden, so it is a render-time
 *  flag rather than a fifth MapEdgeKind. */
export function spineDashArray(intoOpenRound: boolean): string | null {
  return intoOpenRound ? "6 5" : null;
}

/** Local-graph node radius formula (DESIGN_SPEC.md section 5.2): size scales
 *  with how many runs descend from a node, capped so one outlier can't
 *  dominate the canvas. This is the Obsidian "more references, bigger node"
 *  rule, transposed onto lineage.
 *
 *  The Lineage lens (3a) deliberately does NOT use it - 3a's vocabulary is a
 *  fixed radius per node *kind* (NODE_GEOMETRY above). The local-graph lens
 *  (3c) does, but only when the descendant count is a real number: see
 *  `descendantIndex` in ./local-graph.ts, which refuses to count when the
 *  engine reports descent round-by-round rather than run-by-run. A constant
 *  radius that LOOKS like an encoding is worse than an honest uniform one. */
export function radiusFromDescendants(descendants: number): number {
  return 7 + Math.min(descendants, 14) * 0.62;
}

/** Local-graph geometry (DESIGN_SPEC.md 5.2). Radii are in layout units, the
 *  same space the lineage lens uses, so the two canvases stay comparable. */
export const LOCAL_GRAPH = {
  /** Centre (selected) node: r=15 white disc, action stroke, plus a
   *  concentric r=26 dashed halo. Fixed - the centre is not sized by
   *  descendant count, it is sized by being the thing you asked about. */
  centreR: 15,
  centreStrokeWidth: 2.2,
  haloR: 26,
  haloDashArray: "2 3",
  haloStrokeWidth: 1,
  /** SVG marker id for the directed lineage arrowhead. */
  arrowMarkerId: "kalos-lineage-arrowhead",
  /** Extra gap between a node's rim and the arrow tip, so the head lands ON
   *  the rim rather than under the disc. */
  arrowPad: 3,
  /** Label placement: the centre's name sits above its halo, every other
   *  node's sits below its own disc. */
  centreLabelDy: -34,
  centreLabelFontPx: 13,
  nodeLabelGap: 13,
  nodeLabelFontPx: 10.5,
} as const;

export type Point2 = { x: number; y: number };

/** Pull an edge's endpoint back from a node's CENTRE to its RIM, so a
 *  `marker-end` arrowhead touches the circle instead of being buried under
 *  it. Returns the point `radius + pad` short of `to`, along the line from
 *  `from`.
 *
 *  Degenerate input (the two points coincident) returns `to` unchanged: there
 *  is no direction to shorten along, and a NaN coordinate would silently drop
 *  the whole line from the SVG. */
export function shortenToRim(from: Point2, to: Point2, radius: number, pad = LOCAL_GRAPH.arrowPad): Point2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: to.x, y: to.y };
  const back = Math.min(radius + pad, len);
  return { x: to.x - (dx / len) * back, y: to.y - (dy / len) * back };
}
