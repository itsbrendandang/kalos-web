// The Lineage lens's CAMERA: what rectangle of the settled layout the canvas
// should look at.
//
// Why this exists as its own module. The simulation settles the graph in an
// unbounded coordinate space whose extent depends entirely on the campaign -
// four rounds and six proposals occupy a few hundred units, twenty rounds of
// folded runs occupy several thousand. An SVG viewBox fixed at the design
// mock's 1120x620 therefore frames exactly one campaign shape correctly and
// every other one badly: the real engine's eleven-node graph rendered as a
// small cluster with most of the plane empty and every label shrunk with it.
//
// So the viewBox is DERIVED, not fixed. It is the bounding box of everything
// the canvas will actually paint, padded, and clamped to a minimum span.
// Three consequences worth stating, because each one is a decision:
//
//   * Labels are inside the box, not just node discs. A round's name sits 46
//     units above its hub and its sub-caption is several times wider than the
//     r=17 disc underneath it; a camera framed on discs alone crops both at
//     exactly the moment a reader zooms out to see the whole campaign.
//   * The camera moves, the node vocabulary does not. DESIGN_SPEC.md 3.2
//     fixes a radius per node KIND, and those radii stay exactly as specified
//     in layout units. Scale changes because the frame changes, which is what
//     a camera is; the discs are never re-sized to fill space.
//   * Only the callouts that are PAINTED AT REST are reserved for - which is
//     the round-best ones. The rest appear on hover and selection, and
//     reserving room for all of them was measurably worse in both directions
//     that matter: on the live campaign the proposals sit at the right-hand
//     end of the spine, so their unpainted callouts pushed the frame ~110
//     units to the right and the graph visibly hung to the LEFT of a canvas
//     it had also just made itself smaller in. A hover callout instead stays
//     inside the frame by flipping which way it reads - see `RunCallout` in
//     components/workspace/map/lineage-canvas.tsx, which is handed this frame
//     for exactly that. So the camera frames the resting graph, and the one
//     transient label is what bends.
import {
  HUB_LABEL,
  MONO_ADVANCE,
  NODE_GEOMETRY,
  RUN_CALLOUT,
  SELECTION_RING,
  STUB_REACH,
  TEXT_ASCENT,
  TEXT_DESCENT,
  estimateTextWidth,
  type HubLabelSide,
} from "./geometry";
import type { MapNode, UntraceableStub } from "../map-types";

type Point = { x: number; y: number };

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

/** An SVG viewBox rectangle, in layout coordinates. */
export type ViewFrame = { x: number; y: number; width: number; height: number };

/** Breathing room around the content, in layout units. Small on purpose: the
 *  content box already contains every label and callout, so this is margin,
 *  not a guess at how far text might reach. The old fixed-viewBox fit used 96
 *  units of padding per side to stand in for unmeasured labels, which spent
 *  a third of the frame's height on empty space. */
export const FRAME_PADDING = 18;

/** The smallest frame the camera will ever use, in layout units. This is the
 *  zoom-in clamp: without it a single-node graph would frame a ~34-unit box
 *  and render one enormous disc filling the panel.
 *
 *  The numbers are not new. The previous fixed-viewBox fit capped its scale
 *  at 1.6x inside the design's 1120x620 canvas, which is exactly the same
 *  statement as "never frame less than 1120/1.6 by 620/1.6 units" - so the
 *  clamp carries the mock's tuning forward rather than replacing it with a
 *  fresh guess. */
export const MIN_FRAME = { width: 700, height: 388 } as const;

function grow(b: Bounds, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y;
  if (y > b.maxY) b.maxY = y;
}

function growBox(b: Bounds, x0: number, y0: number, x1: number, y1: number): void {
  grow(b, x0, y0);
  grow(b, x1, y1);
}

/** A text box around a baseline point, given an SVG text-anchor. */
function growText(b: Bounds, anchorX: number, baselineY: number, width: number, fontPx: number, anchor: "start" | "middle" | "end"): void {
  const x0 = anchor === "start" ? anchorX : anchor === "end" ? anchorX - width : anchorX - width / 2;
  growBox(b, x0, baselineY - fontPx * TEXT_ASCENT, x0 + width, baselineY + fontPx * TEXT_DESCENT);
}

function isHubKind(n: MapNode): boolean {
  return n.kind === "round-hub" || n.kind === "round-hub-open";
}

/** Characters of allowance for the ` · 6.4` value suffix a run callout prints
 *  next to its label. An estimate, like every width here - see the advance
 *  constants in ./geometry.ts for why measured metrics are not available. */
const VALUE_SUFFIX_CHARS = 8;

/** The bounding box of everything the canvas paints, in layout coordinates,
 *  or null when there is nothing to paint. */
export function contentBounds(args: {
  nodes: readonly MapNode[];
  stubs: readonly UntraceableStub[];
  positions: ReadonlyMap<string, Point>;
  hubPositions: ReadonlyMap<number, Point>;
  labelSides: ReadonlyMap<number, HubLabelSide>;
}): Bounds | null {
  const { nodes, stubs, positions, hubPositions, labelSides } = args;
  const b: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const stubCount = new Map<string, number>();
  for (const s of stubs) stubCount.set(s.nodeId, (stubCount.get(s.nodeId) ?? 0) + s.count);

  let seen = false;
  for (const node of nodes) {
    const p = positions.get(node.id);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    seen = true;

    const geo = NODE_GEOMETRY[node.kind];
    const hub = isHubKind(node);
    // The selection ring is drawn outside small discs, so it, not the radius,
    // is a run node's true reach.
    const reach = hub ? geo.r : Math.max(geo.r, SELECTION_RING.haloR);
    growBox(b, p.x - reach, p.y - reach, p.x + reach, p.y + reach);

    const unnamed = stubCount.get(node.id) ?? 0;

    if (hub) {
      const side = labelSides.get(node.round) ?? "above";
      const offsets = HUB_LABEL[side];
      growText(b, p.x, p.y + offsets.name, estimateTextWidth(node.label, HUB_LABEL.nameFontPx, true), HUB_LABEL.nameFontPx, "middle");
      if (node.sublabel) {
        growText(b, p.x, p.y + offsets.sub, estimateTextWidth(node.sublabel, HUB_LABEL.subFontPx, false), HUB_LABEL.subFontPx, "middle");
      }
    }

    // The radial direction the canvas hangs a callout and a stub along: away
    // from the node's own round hub. The two fall back differently when there
    // is no hub to point away from (a stub drops straight down, a callout
    // reads to the right), and both fallbacks are mirrored here exactly - a
    // camera that disagreed with the renderer about where a label went would
    // clip it in precisely the cases that are already unusual.
    const hubPoint = hub ? null : (hubPositions.get(node.round) ?? null);

    if (unnamed > 0) {
      const sx = hubPoint ? p.x - hubPoint.x : 0;
      const sy = hubPoint ? p.y - hubPoint.y : 1;
      const slen = Math.hypot(sx, sy) || 1;
      grow(b, p.x + (sx / slen) * (geo.r + STUB_REACH), p.y + (sy / slen) * (geo.r + STUB_REACH));
    }

    // A round's best run is the only kind whose callout is painted without
    // any interaction, so it is the only one the frame has to hold.
    if (hub || node.kind !== "round-best") continue;

    const dx = hubPoint ? p.x - hubPoint.x : 1;
    const dy = hubPoint ? p.y - hubPoint.y : 0;
    const len = Math.hypot(dx, dy) || 1;
    const gap = geo.r + (unnamed > 0 ? RUN_CALLOUT.gapWithStub : RUN_CALLOUT.gap);
    const tx = p.x + (dx / len) * gap;
    const ty = p.y + (dy / len) * gap;
    const anchor = dx >= 0 ? "start" : "end";
    const chars = node.label.length + (node.value != null ? VALUE_SUFFIX_CHARS : 0);
    growText(b, tx, ty + RUN_CALLOUT.baselineDy, chars * RUN_CALLOUT.fontPx * MONO_ADVANCE, RUN_CALLOUT.fontPx, anchor);
    if (unnamed > 0) {
      const second = `+${unnamed} unnamed`;
      growText(b, tx, ty + RUN_CALLOUT.secondLineDy, estimateTextWidth(second, RUN_CALLOUT.secondFontPx, true), RUN_CALLOUT.secondFontPx, anchor);
    }
  }

  return seen ? b : null;
}

/** Turn a content box into the viewBox the canvas renders.
 *
 *  Every degenerate case lands on the same answer - a MIN_FRAME-sized box
 *  centred on whatever content there is - rather than on a NaN viewBox, which
 *  SVG renders as a blank panel with no error:
 *    * no nodes at all           -> centred on the origin
 *    * exactly one node          -> centred on it, clamped up to MIN_FRAME
 *    * all nodes collinear       -> the zero-extent axis clamps, the other
 *                                   axis fits normally
 *    * non-finite coordinates    -> treated as no content */
export function fitViewBox(
  bounds: Bounds | null,
  opts: { padding?: number; min?: { width: number; height: number } } = {},
): ViewFrame {
  const padding = opts.padding ?? FRAME_PADDING;
  const min = opts.min ?? MIN_FRAME;
  const finite =
    bounds != null &&
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxY);

  const cx = finite ? (bounds.minX + bounds.maxX) / 2 : 0;
  const cy = finite ? (bounds.minY + bounds.maxY) / 2 : 0;
  const width = Math.max(min.width, finite ? bounds.maxX - bounds.minX + padding * 2 : 0);
  const height = Math.max(min.height, finite ? bounds.maxY - bounds.minY + padding * 2 : 0);

  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** Which way a run's callout should read.
 *
 *  Outward (away from its round hub) by default, per DESIGN_SPEC.md 3.2, so
 *  the text lands clear of the cluster. But a callout that appears on hover
 *  gets no room reserved in the frame, and outward is exactly the direction
 *  that runs off the edge for the nodes at either end of the spine - so when
 *  outward would not fit and inward would, it reads inward instead. If
 *  neither fits (a callout wider than the whole frame) the specified outward
 *  direction wins, because a label that is cut off at the far end at least
 *  starts where the reader is looking. */
export function calloutAnchor(
  anchorX: number,
  width: number,
  outwardDx: number,
  frame: { x: number; width: number },
): "start" | "end" {
  const outward: "start" | "end" = outwardDx >= 0 ? "start" : "end";
  const fits = (a: "start" | "end") => (a === "start" ? anchorX + width <= frame.x + frame.width : anchorX - width >= frame.x);
  if (fits(outward)) return outward;
  const inward: "start" | "end" = outward === "start" ? "end" : "start";
  return fits(inward) ? inward : outward;
}
