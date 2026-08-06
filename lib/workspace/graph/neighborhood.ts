// Pure BFS over the graph's edge list. Powers two things: the hover
// spotlight (depth 1 - the node plus everything it directly touches) and the
// inspector's "neighbours within noise" count. Kept edge-direction-agnostic
// (every edge connects both ways for this purpose) since spotlighting a node
// should light up everything touching it regardless of which end an edge's
// `source`/`target` happens to record.
import type { MapEdge } from "../map-types";

/** How many hops each reachable node is from `startId`, capped at `depth`.
 *  `startId` itself maps to 0. This is the single BFS in the Map tab: the
 *  hover spotlight and the inspector want only the id set (see
 *  `neighborhood` below), while the local-graph lens (DESIGN_SPEC.md section
 *  5, "Around Run N") needs the hop number itself, because that is exactly
 *  what puts a node on the depth-1 ring rather than the depth-2 one.
 *
 *  Insertion order is BFS order, so a caller iterating the map walks the
 *  rings outward without re-sorting. `depth <= 0` returns just the root. */
export function hopDistances(startId: string, edges: readonly MapEdge[], depth: number): Map<string, number> {
  const adjacency = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
    adjacency.get(e.source)!.add(e.target);
    adjacency.get(e.target)!.add(e.source);
  }

  const hops = new Map<string, number>([[startId, 0]]);
  if (depth <= 0) return hops;

  let frontier = [startId];
  for (let hop = 1; hop <= depth; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (!hops.has(neighbour)) {
          hops.set(neighbour, hop);
          next.push(neighbour);
        }
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return hops;
}

/** Every node reachable from `startId` within `depth` hops, including
 *  `startId` itself. `depth <= 0` returns just `{startId}` (or empty if
 *  `startId` isn't in the graph at all - callers should check membership
 *  themselves if that distinction matters). Depth 1 is what hover-spotlight
 *  uses; the local-graph lens goes deeper via `hopDistances`. */
export function neighborhood(startId: string, edges: readonly MapEdge[], depth: number): Set<string> {
  return new Set(hopDistances(startId, edges, depth).keys());
}

/** Just the edges with at least one endpoint in `nodeIds` - what the hover
 *  spotlight highlights alongside the neighbourhood itself. */
export function incidentEdges(nodeIds: ReadonlySet<string>, edges: readonly MapEdge[]): MapEdge[] {
  return edges.filter((e) => nodeIds.has(e.source) || nodeIds.has(e.target));
}
