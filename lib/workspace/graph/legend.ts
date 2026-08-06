// The Lineage lens legend's contents, derived from the graph that is actually
// on screen.
//
// Why this is not a constant array. DESIGN_SPEC.md 3.2 lists a six-mark
// vocabulary, and the mock's legend prints all six. Today's engine can only
// produce three of them: round hubs, proposals, and untraceable-provenance
// stubs. It discards a run's id the moment the run is folded into the base
// data, so `measured run` and `round best` have nothing to hang a node on;
// and it models no failure status at all, so `failed run` can never be
// emitted (see lib/workspace/graph/build-lineage.ts).
//
// A legend that lists all six regardless is a promise the canvas does not
// keep: a reader scans for the green "round best" disc, fails to find one,
// and reasonably concludes the campaign has no best run - when in fact the
// mark does not exist. So every entry carries whether the CURRENT graph
// contains an instance, counted from the node set rather than from a
// hardcoded list of what today's engine happens to support. The day kalos
// starts naming folded runs, the entries light up on their own.
import type { LineageGraph, MapNodeKind } from "../map-types";

export type LegendSwatch = "round" | "measured" | "best" | "failed" | "proposed" | "unnamed";

export type LegendEntry = {
  swatch: LegendSwatch;
  label: string;
  /** True when at least one mark of this kind is drawn on the current canvas. */
  present: boolean;
};

/** The spec's vocabulary, in the spec's order, with the node kinds that
 *  produce each mark. `unnamed` has no kind - it is counted from stubs. */
const VOCABULARY: { swatch: LegendSwatch; label: string; kinds: MapNodeKind[] }[] = [
  { swatch: "round", label: "round", kinds: ["round-hub", "round-hub-open"] },
  { swatch: "measured", label: "measured run", kinds: ["measured-run"] },
  { swatch: "best", label: "round best", kinds: ["round-best"] },
  { swatch: "failed", label: "failed run", kinds: ["failed-run"] },
  { swatch: "proposed", label: "proposed", kinds: ["proposal"] },
];

export function legendEntries(graph: LineageGraph): LegendEntry[] {
  const kinds = new Set(graph.nodes.map((n) => n.kind));
  const entries: LegendEntry[] = VOCABULARY.map((item) => ({
    swatch: item.swatch,
    label: item.label,
    present: item.kinds.some((k) => kinds.has(k)),
  }));
  entries.push({ swatch: "unnamed", label: "unnamed provenance", present: graph.stubs.length > 0 });
  return entries;
}

/** True when at least one entry is dimmed, i.e. the legend needs its caption
 *  explaining what dimming means. */
export function hasAbsentEntries(entries: readonly LegendEntry[]): boolean {
  return entries.some((e) => !e.present);
}
