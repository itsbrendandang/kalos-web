// Pure reads of a node's neighbourhood, used by the Map inspector. Kept out
// of the component so the numbers it states are unit-testable, and so no
// sentence in the UI can drift away from the graph it claims to describe.
import type { LineageGraph, MapNode } from "../map-types";

/** Run-to-run neighbour edges touching this node. Those edges only exist when
 *  the engine reported a conformal band (see build-lineage.ts), so a zero
 *  here means "none within the band", never "we didn't look". */
export function countNeighbours(graph: LineageGraph, nodeId: string): number {
  return graph.edges.filter((e) => e.kind === "run-neighbour" && (e.source === nodeId || e.target === nodeId)).length;
}

/** Proposals that name this node (or its round hub) as an ancestor. */
export function countProposalsBelow(graph: LineageGraph, nodeId: string): number {
  const proposals = new Set(graph.nodes.filter((n) => n.kind === "proposal").map((n) => n.id));
  return graph.edges.filter((e) => e.kind === "cross-round-descent" && e.source === nodeId && proposals.has(e.target)).length;
}

/** Every descendant edge out of this node, proposal or not. */
export function countDescendants(graph: LineageGraph, nodeId: string): number {
  return graph.edges.filter((e) => e.kind === "cross-round-descent" && e.source === nodeId).length;
}

export type Provenance = { named: number; total: number | null };

/** The traceable-vs-total split for one node, resolved against the graph so
 *  `named` counts only ancestors that actually exist as nodes - never the raw
 *  length of an id list that might reference something not drawn. */
export function provenanceOf(graph: LineageGraph, node: MapNode): Provenance | null {
  if (!node.provenance) return null;
  const ids = new Set(graph.nodes.map((n) => n.id));
  const named = node.provenance.traceableIds.filter((id) => ids.has(id) && id !== node.id).length;
  return { named, total: node.provenance.totalCount };
}

/** A Newsreader-set read of the pocket this node sits in. Every clause is
 *  backed by a count from the graph; when there is nothing true to say, this
 *  returns null and the inspector renders nothing rather than filler. */
export function neighbourhoodNarrative(graph: LineageGraph, node: MapNode, noiseBand: number | null): string | null {
  if (node.kind === "round-hub" || node.kind === "round-hub-open") {
    const inRound = graph.nodes.filter((n) => n.round === node.round && n.id !== node.id).length;
    if (inRound === 0) return null;
    return `${inRound} run${inRound === 1 ? "" : "s"} in this round can be named individually. Everything else it rests on was folded in without an id.`;
  }

  const sentences: string[] = [];
  if (noiseBand != null) {
    const neighbours = countNeighbours(graph, node.id);
    if (neighbours >= 2) {
      sentences.push(
        `${neighbours} runs sit within measurement noise of this one. The model is not learning anything new from that pocket.`,
      );
    } else if (neighbours === 1) {
      sentences.push("One run sits within measurement noise of this one.");
    } else {
      sentences.push("Nothing else sits within measurement noise of this one, so it is carrying its own evidence.");
    }
  }

  const prov = provenanceOf(graph, node);
  if (prov && prov.total != null) {
    const unnamed = Math.max(0, prov.total - prov.named);
    if (unnamed > 0) {
      sentences.push(
        `It descends from ${prov.total} rows, ${prov.named} of which can be named; the other ${unnamed} came in without ids and cannot be traced.`,
      );
    }
  }

  return sentences.length > 0 ? sentences.join(" ") : null;
}
