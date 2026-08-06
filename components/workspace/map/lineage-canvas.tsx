"use client";

// The Lineage lens canvas (DESIGN_SPEC.md section 3.2). A pure renderer: it
// takes a built graph plus a frozen layout and draws them. It owns no data,
// no simulation, and no fetch - which is what lets hover, selection, zoom and
// replay scrubbing all re-render it without ever moving a node.
//
// ZERO literal hex, including inside the SVG: every fill/stroke here is a
// `var(--token)` string from lib/workspace/graph/geometry.ts, so the whole
// canvas re-colours correctly when `.dark` flips. That includes every label
// halo - see the halo note below, which is the one place a wrong token
// produces a genuinely unreadable result rather than a slightly-off one.
import { useMemo } from "react";
import {
  EDGE_GEOMETRY,
  HUB_LABEL,
  LABEL_HALO_SURFACE,
  NODE_GEOMETRY,
  RUN_CALLOUT,
  SELECTION_RING,
  STUB_REACH,
  estimateTextWidth,
  spineDashArray,
  type HubLabelSide,
} from "@/lib/workspace/graph/geometry";
import { calloutAnchor } from "@/lib/workspace/graph/frame";
import type { LineageLayout } from "@/lib/workspace/graph/simulation";
import type { LineageGraph, MapNode } from "@/lib/workspace/map-types";

/** Everything not in the spotlight fades to this. Kept as a number (not a
 *  class) because it is applied to SVG groups, where Tailwind's opacity
 *  utilities do not compose with the transform groups above them. */
const FADED_OPACITY = 0.2;

type Props = {
  /** Passed as a plain prop rather than `ref` so the parent can hand the same
   *  element to useGraphViewport without a forwardRef indirection. */
  svgRef: React.RefObject<SVGSVGElement | null>;
  graph: LineageGraph;
  layout: LineageLayout;
  /** Nodes revealed by the replay scrubber. Null means "not scrubbing" -
   *  everything is visible. Hiding a node NEVER changes its position; the
   *  layout is frozen (see simulation.ts). */
  revealedIds: Set<string> | null;
  /** The hover/selection spotlight: these render at full strength, the rest
   *  fade. Null means no spotlight. */
  focusIds: Set<string> | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  zoom: { k: number; x: number; y: number };
};

function isHub(n: MapNode): boolean {
  return n.kind === "round-hub" || n.kind === "round-hub-open";
}

function formatValue(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(v % 1 === 0 ? 0 : 1);
}

export function LineageCanvas({ svgRef, graph, layout, revealedIds, focusIds, selectedId, onSelect, onHover, zoom }: Props) {
  const pos = layout.positions;
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n] as const)), [graph.nodes]);

  const visible = (id: string) => revealedIds == null || revealedIds.has(id);
  const dim = (ids: string[]) => (focusIds == null ? 1 : ids.every((id) => focusIds.has(id)) ? 1 : FADED_OPACITY);

  const openRound = graph.nodes.find((n) => n.kind === "round-hub-open")?.round ?? null;

  return (
    <svg
      ref={svgRef}
      // The camera, derived from the settled layout rather than fixed to the
      // design mock's canvas size - see lib/workspace/graph/frame.ts. With
      // the viewBox equal to the content's own box, `meet` scales the graph
      // as large as the panel allows and centres it, at any node count.
      viewBox={`${layout.frame.x} ${layout.frame.y} ${layout.frame.width} ${layout.frame.height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-label="Experiment lineage graph. Arrow keys pan, shift accelerates, plus and minus zoom, zero resets."
      role="application"
      tabIndex={0}
      className="block h-full w-full touch-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
      onClick={() => onSelect(null)}
      onPointerLeave={() => onHover(null)}
    >
      <g transform={`translate(${zoom.x} ${zoom.y}) scale(${zoom.k})`}>
        {/* Edges first, so every node disc paints over them. */}
        <g fill="none">
          {graph.edges.map((e) => {
            const a = pos.get(e.source);
            const b = pos.get(e.target);
            if (!a || !b || !visible(e.source) || !visible(e.target)) return null;
            const geo = EDGE_GEOMETRY[e.kind];
            const intoOpen =
              e.kind === "round-spine" && openRound != null && nodeById.get(e.target)?.round === openRound;
            return (
              <line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={geo.stroke}
                strokeWidth={geo.strokeWidth}
                strokeDasharray={(e.kind === "round-spine" ? spineDashArray(intoOpen) : geo.dashArray) ?? undefined}
                opacity={dim([e.source, e.target])}
              />
            );
          })}
        </g>

        {/* Untraceable-provenance stubs. A stub is a short dashed line into
            empty space: it says "this node descends from rows that exist but
            cannot be named", without inventing a node, a position, or an
            edge for any of them. The count lives in the inspector (and in
            the callout when the node is focused) - see build-lineage.ts. */}
        <g fill="none">
          {graph.stubs.map((stub) => {
            const node = nodeById.get(stub.nodeId);
            const p = pos.get(stub.nodeId);
            if (!node || !p || !visible(stub.nodeId)) return null;
            const hub = isHub(node) ? null : layout.hubPositions.get(node.round);
            const dx = hub ? p.x - hub.x : 0;
            const dy = hub ? p.y - hub.y : 1;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const r = NODE_GEOMETRY[node.kind].r;
            return (
              <line
                key={stub.id}
                x1={p.x + ux * (r + 2)}
                y1={p.y + uy * (r + 2)}
                x2={p.x + ux * (r + STUB_REACH)}
                y2={p.y + uy * (r + STUB_REACH)}
                stroke="var(--node-stroke)"
                strokeWidth={1.1}
                strokeDasharray="2 3"
                strokeLinecap="round"
                opacity={dim([stub.nodeId])}
              />
            );
          })}
        </g>

        {/* Nodes + their labels. */}
        {graph.nodes.map((node) => {
          const p = pos.get(node.id);
          if (!p || !visible(node.id)) return null;
          const geo = NODE_GEOMETRY[node.kind];
          const hub = isHub(node);
          const selected = node.id === selectedId;
          const focused = focusIds != null && focusIds.has(node.id);
          const stub = graph.stubs.find((s) => s.nodeId === node.id) ?? null;

          return (
            <g
              key={node.id}
              opacity={dim([node.id])}
              tabIndex={0}
              role="button"
              aria-label={nodeAriaLabel(node, stub?.count ?? 0)}
              aria-pressed={selected}
              className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-fg"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(node.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(node.id);
                }
              }}
              onPointerEnter={() => onHover(node.id)}
              onFocus={() => onHover(node.id)}
            >
              {selected && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={SELECTION_RING.haloR}
                  fill="none"
                  stroke={SELECTION_RING.stroke}
                  strokeWidth={SELECTION_RING.haloStrokeWidth}
                  strokeDasharray={SELECTION_RING.haloDashArray}
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={geo.r}
                fill={geo.fill}
                stroke={selected ? SELECTION_RING.stroke : (geo.stroke ?? undefined)}
                strokeWidth={selected ? SELECTION_RING.strokeWidth : geo.strokeWidth || undefined}
                strokeDasharray={geo.dashArray ?? undefined}
              />

              {hub ? (
                <HubLabels node={node} x={p.x} y={p.y} geo={geo} side={layout.labelSides.get(node.round) ?? "above"} />
              ) : (
                (focused || selected || node.kind === "round-best") && (
                  <RunCallout
                    node={node}
                    x={p.x}
                    y={p.y}
                    hub={layout.hubPositions.get(node.round) ?? null}
                    frame={layout.frame}
                    unnamed={focused || selected ? (stub?.count ?? 0) : 0}
                  />
                )
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function nodeAriaLabel(node: MapNode, unnamed: number): string {
  const parts = [node.label];
  if (node.sublabel) parts.push(node.sublabel);
  if (node.value != null) parts.push(`value ${formatValue(node.value)}`);
  if (unnamed > 0) parts.push(`${unnamed} unnamed ancestor rows`);
  return parts.join(", ");
}

/** Round name + sub-caption, both fully outside the r=17 hub disc (spec 3.2:
 *  hubY-46 and hubY-31), plus the best-titer numeral inside it.
 *
 *  `side` moves the pair below the hub for a hub sitting in a valley of the
 *  spine, where the spine's own segments run through the space above it -
 *  decided once, in `hubLabelSides`, so the ring's empty wedge moves with it.
 *  The offsets themselves live in HUB_LABEL because the camera has to know
 *  them too (lib/workspace/graph/frame.ts).
 *
 *  HALO RULE, and the one that actually bites: labels sitting on the canvas
 *  halo with LABEL_HALO_SURFACE. The numeral INSIDE the dark disc is painted
 *  in the on-action foreground and must halo with the DISC's own fill
 *  (`geo.labelHalo`), or a surface-coloured halo paints a bright blob on top
 *  of the dark disc and swallows the digit whole. Both are tokens, because
 *  both flip with the theme. */
function HubLabels({
  node,
  x,
  y,
  geo,
  side,
}: {
  node: MapNode;
  x: number;
  y: number;
  geo: (typeof NODE_GEOMETRY)[MapNode["kind"]];
  side: HubLabelSide;
}) {
  const offsets = HUB_LABEL[side];
  return (
    <>
      <text
        x={x}
        y={y + offsets.name}
        textAnchor="middle"
        className="font-plex-mono text-[11.5px] font-semibold"
        fill="var(--fg)"
        paintOrder="stroke"
        stroke={LABEL_HALO_SURFACE}
        strokeWidth={3.6}
        strokeLinejoin="round"
      >
        {node.label}
      </text>
      {node.sublabel && (
        <text
          x={x}
          y={y + offsets.sub}
          textAnchor="middle"
          className="text-[11.5px]"
          fill="var(--muted)"
          paintOrder="stroke"
          stroke={LABEL_HALO_SURFACE}
          strokeWidth={3.6}
          strokeLinejoin="round"
        >
          {node.sublabel}
        </text>
      )}
      {node.value != null && (
        <text
          x={x}
          y={y + 4}
          textAnchor="middle"
          className="font-plex-mono text-[11px] font-medium"
          // From the node vocabulary table, not re-derived here. It must NOT
          // be `--primary-foreground`: that token flips to near-black in dark
          // mode (because dark `--primary` is near-white), which would put
          // #171717 text on the `--action` disc at 3.07:1 - below AA. `--action`
          // is specified to carry WHITE text in both themes (5.72:1 dark,
          // 11.6:1 light), which is exactly what NODE_GEOMETRY records.
          fill={geo.textFill ?? "var(--fg)"}
          paintOrder="stroke"
          stroke={geo.labelHalo}
          strokeWidth={3.6}
          strokeLinejoin="round"
        >
          {formatValue(node.value)}
        </text>
      )}
    </>
  );
}

/** Per-node callout placed along the node's own radial direction from its
 *  hub, anchored `start`/`end` by the sign of the x-offset so the text
 *  normally lands OUTSIDE the cluster rather than back across it (spec 3.2).
 *
 *  The exception is the frame edge. Most of these callouts only exist while a
 *  node is hovered or selected, so the camera does not reserve room for them
 *  (see lib/workspace/graph/frame.ts) - which means the outward direction can
 *  run a run's label straight off the side of the SVG, where it is clipped
 *  mid-word. When that would happen the anchor flips and the text reads back
 *  toward the graph instead. It is still legible over the canvas thanks to
 *  the halo, and a label that reads inward beats half a label. */
function RunCallout({
  node,
  x,
  y,
  hub,
  frame,
  unnamed,
}: {
  node: MapNode;
  x: number;
  y: number;
  hub: { x: number; y: number } | null;
  frame: LineageLayout["frame"];
  unnamed: number;
}) {
  const dx = hub ? x - hub.x : 1;
  const dy = hub ? y - hub.y : 0;
  const len = Math.hypot(dx, dy) || 1;
  const gap = NODE_GEOMETRY[node.kind].r + (unnamed > 0 ? RUN_CALLOUT.gapWithStub : RUN_CALLOUT.gap);
  const tx = x + (dx / len) * gap;
  const ty = y + (dy / len) * gap;
  const text = `${node.label}${node.value != null ? ` · ${formatValue(node.value)}` : ""}`;
  const anchor = calloutAnchor(tx, estimateTextWidth(text, RUN_CALLOUT.fontPx, true), dx, frame);
  const halo = { paintOrder: "stroke" as const, stroke: LABEL_HALO_SURFACE, strokeWidth: 3.6, strokeLinejoin: "round" as const };

  return (
    <>
      <text
        x={tx}
        y={ty + RUN_CALLOUT.baselineDy}
        textAnchor={anchor}
        className="font-plex-mono text-[10.5px] font-medium"
        fill="var(--fg)"
        {...halo}
      >
        {text}
      </text>
      {unnamed > 0 && (
        <text x={tx} y={ty + RUN_CALLOUT.secondLineDy} textAnchor={anchor} className="font-plex-mono text-[10px]" fill="var(--muted)" {...halo}>
          {`+${unnamed} unnamed`}
        </text>
      )}
    </>
  );
}
