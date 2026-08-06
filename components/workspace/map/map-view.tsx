"use client";

// The Map tab body (DESIGN_SPEC.md sections 3a-3c shared shell + 3a Lineage
// + 3c local graph). Owns everything the lenses share: the lens switch, the
// campaign/local mode switch, the canvas frame, and the fetch. Interactions
// and Surface get explicit, honest placeholders rather than a half-drawn graph.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DemoBadge } from "@/components/page-header";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { Loading } from "@/components/page-header";
import { getLineageGraph, type LineageResult } from "@/lib/workspace/graph/lineage-adapter";
import { layoutLineage, layoutSignature } from "@/lib/workspace/graph/simulation";
import { neighborhood } from "@/lib/workspace/graph/neighborhood";
import { runRootCandidates } from "@/lib/workspace/graph/local-graph";
import type { MapLens, MapNode } from "@/lib/workspace/map-types";
import { LensSwitch } from "./lens-switch";
import { LineageCanvas } from "./lineage-canvas";
import { MapCounts, MapLegend } from "./map-overlays";
import { useGraphViewport } from "./use-graph-viewport";
import { LineageInspector } from "./lineage-inspector";
import { ReplayFooter } from "./replay-footer";
import { GraphModeSwitch, GraphSettingsButton, type MapMode } from "./graph-mode-switch";
import { LocalGraphEmptyState, LocalGraphView } from "./local-graph-view";

export function MapView({ campaignId }: { campaignId: string }) {
  const [lens, setLens] = useState<MapLens>("lineage");
  const [mode, setMode] = useState<MapMode>("campaign");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rootId, setRootId] = useState<string | null>(null);
  const [result, setResult] = useState<LineageResult | { status: "loading" }>({ status: "loading" });

  const load = useCallback(() => {
    setResult({ status: "loading" });
    getLineageGraph(campaignId).then(setResult);
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;
    getLineageGraph(campaignId).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const graph = result.status === "ok" ? result.graph : null;

  // Which runs this campaign can name, and therefore what "Around Run N" is
  // even able to centre on. Usually empty - see local-graph-view.tsx.
  const rootCandidates = useMemo(() => (graph ? runRootCandidates(graph) : []), [graph]);
  const root: MapNode | null = useMemo(() => {
    if (rootCandidates.length === 0) return null;
    const chosen = rootCandidates.find((n) => n.id === rootId);
    if (chosen) return chosen;
    // Falling back to the SELECTED node keeps the two modes talking to each
    // other: clicking a run in the whole-campaign lens and then switching
    // scope centres on the run you were already looking at.
    return rootCandidates.find((n) => n.id === selectedId) ?? rootCandidates[0];
  }, [rootCandidates, rootId, selectedId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-8 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">Lens</span>
        <LensSwitch value={lens} onChange={setLens} />
        <div className="ml-auto flex items-center gap-2.5">
          {result.status === "ok" && result.demo && <DemoBadge />}
          {result.status === "ok" && lens === "lineage" && (
            <GraphModeSwitch
              mode={mode}
              onChange={setMode}
              localLabel={root ? `Around ${root.label}` : "Around a run"}
            />
          )}
          {result.status === "ok" && lens === "lineage" && mode === "local" && (
            <GraphSettingsButton
              open={settingsOpen}
              onToggle={() => setSettingsOpen((open) => !open)}
              disabled={root == null}
              disabledReason="Graph settings apply to the local graph, which has no run to centre on."
            />
          )}
        </div>
      </div>

      {result.status === "loading" && (
        <div className="grid flex-1 place-items-center">
          <Loading label="Building lineage graph" />
        </div>
      )}

      {result.status === "unavailable" && (
        <div className="grid flex-1 place-items-center p-8">
          <ServiceUnavailable
            onRetry={load}
            busy={false}
            title="Map unavailable"
            body="The dashboard could not reach the kalos engine, so there is no lineage to draw."
          />
        </div>
      )}

      {result.status === "ok" && lens === "lineage" && mode === "campaign" && (
        <LineageLens result={result} selectedId={selectedId} onSelect={setSelectedId} />
      )}
      {result.status === "ok" && lens === "lineage" && mode === "local" && root == null && (
        <LocalGraphEmptyState graph={result.graph} />
      )}
      {result.status === "ok" && lens === "lineage" && mode === "local" && root != null && (
        <LocalGraphView
          graph={result.graph}
          campaignId={campaignId}
          root={root}
          onRoot={(node) => setRootId(node.id)}
          settingsOpen={settingsOpen}
          onOpenRun={(node) => {
            setSelectedId(node.id);
            setMode("campaign");
          }}
        />
      )}
      {result.status === "ok" && lens !== "lineage" && <LensPlaceholder lens={lens} />}
    </div>
  );
}

// The two unbuilt lenses.
//
// Neither is a "coming soon" card. Both say exactly which quantity the lens
// would show, exactly what the engine reports instead, and why the gap cannot
// be closed in the dashboard - because in both cases the honest answer is
// that the number does not exist yet, not that a component is missing.
//
// The Interactions case is the one worth being blunt about: it is tempting to
// draw a pairwise grid out of the per-input driver correlations the engine
// already returns. That grid would be a fabrication. A main effect says how
// one input moves the target on its own; it carries no information at all
// about how two inputs behave TOGETHER, and any cell computed from a pair of
// them would be an arithmetic artefact wearing the clothes of a result.
const LENS_COPY: Record<Exclude<MapLens, "lineage">, { eyebrow: string; title: string; body: string; note: string }> = {
  interactions: {
    eyebrow: "Interactions lens",
    title: "No interaction strengths to draw",
    body:
      "This lens reads how two inputs behave together: whether raising glucose is worth more when the feed starts early than when it starts late. The kalos engine does not compute that quantity anywhere. What it reports is one input at a time - a signed Spearman correlation per input, and the surrogate's per-dimension lengthscale importances. Neither can be turned into a pairwise strength without inventing one, so nothing is drawn.",
    note: "Pairwise interaction strength is new modelling work in the engine, not a missing field in a response the dashboard already reads.",
  },
  surface: {
    eyebrow: "Surface lens",
    title: "No predicted surface to draw",
    body:
      "This lens reads the surrogate's predicted response across the two strongest inputs, with the measured runs laid over it. The dashboard's engine client already declares the block it would need - a response_surface on the analysis, carrying the grid axes, the predicted grid, and the observed runs projected onto those two axes - but no kalos build has ever returned one, so there is no grid to shade and no points to place on it.",
    note: "A response surface is the model's prediction rather than measurement, and will be labelled as such on the day the engine ships one.",
  },
};

function LensPlaceholder({ lens }: { lens: Exclude<MapLens, "lineage"> }) {
  const copy = LENS_COPY[lens];
  return (
    <div className="grid flex-1 place-items-center overflow-y-auto px-8 py-10">
      <div className="flex max-w-[62ch] flex-col gap-2.5 rounded-card border border-border bg-card px-7 py-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">{copy.eyebrow}</div>
        <div className="text-[14px] font-semibold text-fg">{copy.title}</div>
        <p className="text-[12.5px] leading-[1.55] text-muted [text-wrap:pretty]">{copy.body}</p>
        <p className="mt-1.5 border-t border-border pt-3 text-[11.5px] leading-[1.5] text-muted [text-wrap:pretty]">{copy.note}</p>
      </div>
    </div>
  );
}

type OkResult = Extract<LineageResult, { status: "ok" }>;

function LineageLens({
  result,
  selectedId,
  onSelect,
}: {
  result: OkResult;
  /** Selection is owned by MapView so the local-graph mode's "Open Run N"
   *  can hand a run back to this lens already selected. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { graph } = result;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Set<string> | null>(null);

  // The frozen layout. Memoised on the graph's STRUCTURAL signature, so the
  // simulation re-runs only when the node/edge set changes - never on hover,
  // selection, zoom, or a replay drag.
  const signature = layoutSignature(graph);
  const layout = useMemo(
    () => layoutLineage(graph),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );

  const zoom = useGraphViewport(svgRef);

  // Hover/selection spotlight: the node plus everything one hop away, with
  // its incident edges. Everything else fades (see FADED_OPACITY).
  const focusRoot = hoverId ?? selectedId;
  const focusIds = useMemo(() => {
    if (query.trim() !== "") return matchIds(graph, query);
    if (!focusRoot) return null;
    // Exactly one hop, and no further. An earlier version also folded in both
    // endpoints of every incident edge, which looked equivalent but is not:
    // as soon as the neighbourhood contained a round hub, "every edge
    // touching the set" pulled in every run in that round, and the spotlight
    // lit up the whole graph. Edges light up on their own - the canvas keeps
    // an edge at full strength only when BOTH its endpoints are in this set.
    return neighborhood(focusRoot, graph.edges, 1);
  }, [focusRoot, graph, query]);

  const matchCount = query.trim() === "" ? null : (focusIds?.size ?? 0);
  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;

  if (graph.nodes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <div className="text-[13px] font-semibold text-fg">No lineage to draw</div>
        <p className="max-w-[52ch] text-[12.5px] leading-[1.5] text-muted">
          There is no active campaign on the engine, so there are no rounds, runs, or ancestry to graph.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-card">
          <LineageCanvas
            svgRef={svgRef}
            graph={graph}
            layout={layout}
            revealedIds={revealed}
            focusIds={focusIds}
            selectedId={selectedId}
            onSelect={onSelect}
            onHover={setHoverId}
            zoom={zoom}
          />
          <MapCounts graph={graph} query={query} onQuery={setQuery} matchCount={matchCount} />
          <MapLegend graph={graph} />
          {(zoom.k !== 1 || zoom.x !== 0 || zoom.y !== 0) && (
            // Wheel-zoom and drag-pan have no mouse-only way back, and the
            // keyboard "0" reset is invisible to anyone not using it. Shown
            // only once the camera has actually moved.
            <button
              type="button"
              onClick={zoom.reset}
              className="absolute bottom-[22px] right-6 rounded-[10px] border border-border bg-card px-3 py-1.5 text-[11.5px] font-semibold text-fg transition-colors hover:bg-blue-soft"
            >
              Reset view
            </button>
          )}
        </div>
        <LineageInspector graph={graph} node={selected} noiseBand={result.noiseBand} target={result.target} />
      </div>
      <ReplayFooter graph={graph} openRound={result.openRound} onReveal={setRevealed} />
    </div>
  );
}

/** Search matches a run's label, its full id, or any recipe key/value. Purely
 *  a spotlight filter - it never hides or moves a node. */
function matchIds(graph: OkResult["graph"], query: string): Set<string> {
  const q = query.trim().toLowerCase();
  const out = new Set<string>();
  for (const n of graph.nodes) {
    const recipe = n.recipe ? Object.entries(n.recipe).map(([k, v]) => `${k} ${v}`).join(" ") : "";
    const hay = `${n.label} ${n.id} ${n.sublabel ?? ""} ${recipe}`.toLowerCase();
    if (hay.includes(q)) out.add(n.id);
  }
  return out;
}
