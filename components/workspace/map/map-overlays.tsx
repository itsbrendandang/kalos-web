"use client";

// Canvas overlays (DESIGN_SPEC.md section 3.2, "Overlays"): absolutely
// positioned HTML on top of the SVG, not SVG elements - so the search field
// is a real <input> with real focus behaviour and the legend is real text
// that reflows and can be selected.
import { hasAbsentEntries, legendEntries, type LegendSwatch } from "@/lib/workspace/graph/legend";
import type { LineageGraph } from "@/lib/workspace/map-types";

/** Runs that actually got a node on the canvas, as opposed to runs the engine
 *  says exist. The two differ whenever provenance is not instrumented. */
function drawnRuns(graph: LineageGraph): number {
  return graph.nodes.filter((n) => n.kind === "measured-run" || n.kind === "round-best" || n.kind === "failed-run").length;
}

export function MapCounts({
  graph,
  query,
  onQuery,
  matchCount,
}: {
  graph: LineageGraph;
  query: string;
  onQuery: (q: string) => void;
  matchCount: number | null;
}) {
  return (
    // The card-coloured backing is not in the mock, where the overlays sat on
    // empty white. Once the canvas can be zoomed, graph lines run under the
    // corners and unbacked text becomes unreadable. Flat fill, no shadow -
    // the surface token, so it flips with the theme like everything else.
    <div className="pointer-events-none absolute left-6 top-5 flex flex-col gap-2 rounded-[11px] bg-card p-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
        {graph.runCount} run{graph.runCount === 1 ? "" : "s"} · {graph.roundCount} round{graph.roundCount === 1 ? "" : "s"}
      </div>
      {drawnRuns(graph) < graph.runCount && (
        // Without this line the count above is a quiet lie: it says 142 runs
        // while the canvas draws none of them, because today's engine discards
        // a run's id when it folds it into the base data, leaving nothing to
        // hang a node on. Saying so is the whole point - a reader must never
        // conclude from an empty canvas that the campaign is empty.
        <div className="max-w-[196px] text-[10.5px] leading-[1.45] text-muted">
          {drawnRuns(graph)} of {graph.runCount} drawn. The engine does not name individual runs once they are folded into
          the base data, so the rest cannot be placed.
        </div>
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Find a run or recipe"
        aria-label="Find a run or recipe"
        className="pointer-events-auto w-[196px] rounded-[10px] border border-border bg-card px-[11px] py-2 text-[11.5px] text-fg placeholder:text-muted"
      />
      {query.trim() !== "" && (
        <div className="text-[10.5px] text-muted">
          {matchCount === 0 ? "No match" : `${matchCount} match${matchCount === 1 ? "" : "es"}`}
        </div>
      )}
    </div>
  );
}

function Swatch({ kind }: { kind: LegendSwatch }) {
  if (kind === "round") return <span className="size-3 shrink-0 rounded-md bg-action" />;
  if (kind === "best") return <span className="size-[11px] shrink-0 rounded-md bg-green" />;
  if (kind === "failed") return <span className="size-[11px] shrink-0 rounded-md border border-amber bg-card" />;
  if (kind === "proposed") return <span className="size-[11px] shrink-0 rounded-md border border-dashed border-action bg-card" />;
  if (kind === "unnamed")
    return (
      <span className="flex size-[11px] shrink-0 items-center justify-center">
        <span className="h-px w-[11px] border-t border-dashed border-node-stroke" />
      </span>
    );
  return <span className="size-[11px] shrink-0 rounded-md border border-node-stroke bg-card" />;
}

/** The six-mark legend from spec 3.2, with every entry the CURRENT graph does
 *  not contain dimmed and said out loud. See lib/workspace/graph/legend.ts for
 *  why: three of the six marks cannot be produced by today's engine at all,
 *  and a legend that quietly lists them describes a canvas the reader is not
 *  looking at. Entries are never dropped, only dimmed - the vocabulary is
 *  still the vocabulary, and a mark that is absent today is worth knowing
 *  about. */
export function MapLegend({ graph }: { graph: LineageGraph }) {
  const entries = legendEntries(graph);
  return (
    <div className="pointer-events-none absolute bottom-[22px] left-6 flex max-w-[196px] flex-col gap-[7px] rounded-[11px] bg-card p-1.5">
      {entries.map((entry) => (
        <div
          key={entry.label}
          className={`flex items-center gap-[7px] text-[11px] text-muted ${entry.present ? "" : "opacity-45"}`}
        >
          <Swatch kind={entry.swatch} />
          {entry.label}
          {!entry.present && <span className="sr-only">, none in this graph</span>}
        </div>
      ))}
      {hasAbsentEntries(entries) && (
        <p className="text-[10.5px] leading-[1.45] text-muted">Dimmed marks have no instance in this campaign.</p>
      )}
    </div>
  );
}
