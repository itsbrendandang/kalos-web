"use client";

// The local-graph canvas (DESIGN_SPEC.md 5.2). A pure renderer over the
// layout computed in lib/workspace/graph/local-graph.ts: centre node with its
// dashed halo and a label above, depth rings around it, directed lineage
// arrows, faint undirected neighbour links, and dashed SOP governance links
// that render empty because kalos emits none.
//
// ZERO literal hex, including inside the SVG and inside the arrowhead
// `<marker>`: every fill and stroke is a `var(--token)` string, so the whole
// canvas re-colours when `.dark` flips.
//
// The arrowheads are the one bit of geometry worth reading twice. A directed
// edge drawn centre-to-centre puts its head UNDER the target disc, where it is
// invisible and the edge reads as undirected. Each lineage edge is therefore
// shortened by the target's own radius plus a pad (`shortenToRim`), so the
// head lands on the rim - and because node radii change with the node-size
// slider, the shortening has to be recomputed from the same radius the circle
// is drawn with, never from a constant.
import { EDGE_GEOMETRY, LOCAL_GRAPH, NODE_GEOMETRY, shortenToRim } from "@/lib/workspace/graph/geometry";
import { isHubKind, type LocalGraphLayout } from "@/lib/workspace/graph/local-graph";
import type { GroupColor } from "@/lib/workspace/graph/graph-settings";
import type { MapEdge, MapNode } from "@/lib/workspace/map-types";

/** Group membership is drawn as a ring OUTSIDE the node rather than as a fill,
 *  so a coloured group never overwrites the node vocabulary underneath it (a
 *  proposal in a group is still visibly a dashed proposal). */
const GROUP_STROKE: Record<GroupColor, { stroke: string; dashArray: string | null }> = {
  green: { stroke: "var(--green)", dashArray: null },
  amber: { stroke: "var(--amber)", dashArray: null },
  "action-dashed": { stroke: "var(--action)", dashArray: "3 2.8" },
  action: { stroke: "var(--action)", dashArray: null },
};

type LocalEdgeStyle = { stroke: string; strokeWidth: number; dashArray: string | null };

/** Undirected, faint, no marker (spec 5.2, "Neighbour edges"). */
const NEIGHBOUR_EDGE: LocalEdgeStyle = { stroke: "var(--border)", strokeWidth: 1.2, dashArray: null };
/** Directed descent (spec 5.2, "Lineage edges are directed"). */
const LINEAGE_EDGE: LocalEdgeStyle = { stroke: "var(--node-stroke)", strokeWidth: 1.3, dashArray: null };
/** Governance. Achromatic and heavier-dashed rather than the mock's blue -
 *  see EDGE_GEOMETRY["sop-governance"] for why. Never emitted today. */
const SOP_EDGE: LocalEdgeStyle = EDGE_GEOMETRY["sop-governance"];

const HALO = {
  paintOrder: "stroke" as const,
  stroke: "var(--card)",
  strokeWidth: 3.6,
  strokeLinejoin: "round" as const,
};

function nodeStroke(node: MapNode): { stroke: string; strokeWidth: number; dashArray: string | null; fill: string } {
  const geo = NODE_GEOMETRY[node.kind];
  return { stroke: geo.stroke ?? "var(--action)", strokeWidth: geo.strokeWidth || 1.2, dashArray: geo.dashArray, fill: geo.fill };
}

export function LocalGraphCanvas({
  layout,
  groupOf,
  showArrows,
  onCentre,
}: {
  layout: LocalGraphLayout;
  /** The first group a node belongs to, or null. */
  groupOf: (nodeId: string) => GroupColor | null;
  showArrows: boolean;
  /** Clicking a run re-centres the local graph on it, the way a local graph
   *  is meant to be walked. Hubs and proposals are not re-centreable, so the
   *  caller returns false for them and the node renders as plain. */
  onCentre: (node: MapNode) => void;
}) {
  const { frame, positions, radii } = layout;

  const edgeGeometry = (edge: MapEdge): LocalEdgeStyle => {
    if (edge.kind === "sop-governance") return SOP_EDGE;
    if (edge.kind === "cross-round-descent") return LINEAGE_EDGE;
    return NEIGHBOUR_EDGE;
  };

  return (
    <svg
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-label={`Local lineage graph around ${layout.root.label}`}
      role="img"
      className="block h-full w-full"
    >
      <defs>
        <marker
          id={LOCAL_GRAPH.arrowMarkerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--node-stroke)" />
        </marker>
      </defs>

      <g fill="none">
        {layout.edges.map((edge) => {
          const a = positions.get(edge.source);
          const b = positions.get(edge.target);
          if (!a || !b) return null;
          const geo = edgeGeometry(edge);
          const directed = edge.kind === "cross-round-descent" && showArrows;
          // Only a directed edge is pulled back to the rim: an undirected one
          // has no head to place and looks broken with a gap at one end.
          const end = directed ? shortenToRim(a, b, radii.get(edge.target) ?? 0) : b;
          return (
            <line
              key={edge.id}
              x1={a.x}
              y1={a.y}
              x2={end.x}
              y2={end.y}
              stroke={geo.stroke}
              strokeWidth={geo.strokeWidth}
              strokeDasharray={geo.dashArray ?? undefined}
              markerEnd={directed ? `url(#${LOCAL_GRAPH.arrowMarkerId})` : undefined}
            />
          );
        })}
      </g>

      {layout.nodes.map((entry) => {
        const { node, radius, x, y } = entry;
        const centre = entry.hop === 0;
        const geo = nodeStroke(node);
        const group = groupOf(node.id);
        const canCentre = !centre && !isHubKind(node.kind) && node.kind !== "proposal" && node.kind !== "sop";

        return (
          <g
            key={node.id}
            role={canCentre ? "button" : undefined}
            tabIndex={canCentre ? 0 : undefined}
            aria-label={canCentre ? `Centre the graph on ${node.label}` : undefined}
            className={canCentre ? "cursor-pointer outline-none [&:focus-visible>circle]:stroke-fg" : undefined}
            onClick={canCentre ? () => onCentre(node) : undefined}
            onKeyDown={
              canCentre
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onCentre(node);
                    }
                  }
                : undefined
            }
          >
            {centre && (
              <circle
                cx={x}
                cy={y}
                r={LOCAL_GRAPH.haloR}
                fill="none"
                stroke="var(--action)"
                strokeWidth={LOCAL_GRAPH.haloStrokeWidth}
                strokeDasharray={LOCAL_GRAPH.haloDashArray}
              />
            )}
            {group && (
              <circle
                cx={x}
                cy={y}
                r={radius + 3.5}
                fill="none"
                stroke={GROUP_STROKE[group].stroke}
                strokeWidth={1.4}
                strokeDasharray={GROUP_STROKE[group].dashArray ?? undefined}
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={radius}
              fill={centre ? "var(--card)" : geo.fill}
              stroke={centre ? "var(--action)" : geo.stroke}
              strokeWidth={centre ? LOCAL_GRAPH.centreStrokeWidth : geo.strokeWidth}
              strokeDasharray={(centre ? null : geo.dashArray) ?? undefined}
            />
            <text
              x={x}
              y={centre ? y + LOCAL_GRAPH.centreLabelDy : y + radius + LOCAL_GRAPH.nodeLabelGap}
              textAnchor="middle"
              className={
                centre
                  ? "font-plex-mono text-[13px] font-bold"
                  : "font-plex-mono text-[10.5px]"
              }
              fill="var(--fg)"
              {...HALO}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
