"use client";

// The local-graph lens body (DESIGN_SPEC.md section 5): canvas + floating
// settings panel + groups legend + footer.
//
// THE PRIMARY STATE OF THIS SURFACE IS THE EMPTY ONE, and that is not a
// pessimistic reading - it is what today's engine produces. kalos discards a
// run's id the moment it folds the run into the base data, so a live campaign
// with 142 runs offers zero individually nameable runs to centre a local graph
// on. The six things it can name are round-4 proposals: recipes nobody has
// executed, which are not runs and cannot be the "Run N" in "Around Run N".
// So the no-root case is written first, in full sentences, rather than being
// handled as a fallback that renders an empty canvas.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { evaluateQuery } from "@/lib/workspace/graph/graph-query";
import {
  DEFAULT_SETTINGS,
  parseSettings,
  readServerSettings,
  readStoredSettings,
  saveSettings,
  sopIsAvailable,
  subscribeSettings,
  type GraphSettings,
  type GroupColor,
} from "@/lib/workspace/graph/graph-settings";
import { descendantIndex, layoutLocalGraph, localNarrative } from "@/lib/workspace/graph/local-graph";
import type { LineageGraph, MapNode } from "@/lib/workspace/map-types";
import { GROUP_DOT_CLASS, GraphSettingsPanel } from "./graph-settings-panel";
import { LocalGraphCanvas } from "./local-graph-canvas";

export function LocalGraphEmptyState({ graph }: { graph: LineageGraph }) {
  const proposals = graph.nodes.filter((n) => n.kind === "proposal").length;
  return (
    <div className="grid flex-1 place-items-center overflow-y-auto px-8 py-10">
      <div className="flex max-w-[62ch] flex-col gap-2.5 rounded-card border border-border bg-card px-7 py-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">Local graph</div>
        <div className="text-[14px] font-semibold text-fg">There is no run this campaign can name</div>
        <p className="text-[12.5px] leading-[1.55] text-muted [text-wrap:pretty]">
          A local graph is centred on one run and walks outward from it. The engine reports{" "}
          {`${graph.runCount} ${graph.runCount === 1 ? "run" : "runs"}`}{" "}
          in this campaign, but it discards a run&rsquo;s id the moment the run is folded into the base data, so not one of
          them can be pointed at individually. There is nothing to put in the middle.
        </p>
        {proposals > 0 && (
          <p className="text-[12.5px] leading-[1.55] text-muted [text-wrap:pretty]">
            {/* No round number here: the design mock's campaign was on round
                4, and hard-coding that asserted a round this campaign may not
                be on. The count below is graph-derived; the round is not
                needed to make the point. */}
            The {proposals} thing{proposals === 1 ? "" : "s"} this campaign can name {proposals === 1 ? "is a" : "are"}{" "}
            open-round proposal{proposals === 1 ? "" : "s"}: recipes the model has suggested and nobody has run. Centring
            on one would draw a graph of a run that does not exist.
          </p>
        )}
        <p className="mt-1.5 border-t border-border pt-3 text-[11.5px] leading-[1.5] text-muted [text-wrap:pretty]">
          Whole campaign still works: it draws the rounds, their proposals, and counted stubs for the provenance that
          cannot be named. This mode needs per-run ids the engine does not keep.
        </p>
      </div>
    </div>
  );
}

export function LocalGraphView({
  graph,
  campaignId,
  root,
  onRoot,
  settingsOpen,
  onOpenRun,
}: {
  graph: LineageGraph;
  campaignId: string;
  root: MapNode;
  onRoot: (node: MapNode) => void;
  settingsOpen: boolean;
  /** Hands the centre run back to the whole-campaign lens, selected, which is
   *  where a run's recipe and provenance are actually readable. */
  onOpenRun: (node: MapNode) => void;
}) {
  const stored = useSyncExternalStore(
    subscribeSettings,
    useCallback(() => readStoredSettings(campaignId), [campaignId]),
    readServerSettings,
  );
  const settings = useMemo(() => parseSettings(stored), [stored]);

  // The store IS localStorage: writing to it notifies subscribers, which
  // re-renders this component with the new snapshot. No mirrored React state
  // to drift out of sync with what was actually persisted.
  const update = useCallback((next: GraphSettings) => saveSettings(campaignId, next), [campaignId]);

  const sopAvailable = sopIsAvailable(graph);

  const filterResult = useMemo(() => evaluateQuery(graph, settings.filterQuery), [graph, settings.filterQuery]);

  /** Which nodes the filters let through. A query the campaign cannot answer
   *  (see graph-query.ts) filters NOTHING - emptying the canvas on the
   *  strength of a field the data does not carry would be the worst of both
   *  worlds: an invisible failure that looks like a result. */
  const allowedIds = useMemo(() => {
    const sets: Set<string>[] = [];
    if (settings.measuredOnly) {
      sets.push(new Set(graph.nodes.filter((n) => n.kind !== "proposal" && n.kind !== "sop").map((n) => n.id)));
    }
    if (filterResult.kind === "ok") sets.push(filterResult.ids);
    if (sets.length === 0) return null;
    return sets.reduce((acc, set) => new Set([...acc].filter((id) => set.has(id))));
  }, [graph.nodes, settings.measuredOnly, filterResult]);

  const descendants = useMemo(() => descendantIndex(graph), [graph]);

  const layout = useMemo(
    () =>
      layoutLocalGraph(graph, root.id, {
        depth: settings.depth,
        linkDistance: settings.linkDistance,
        clusterByRound: settings.clusterByRound,
        nodeSize: settings.nodeSize,
        allowedIds,
        descendants,
        reserveRight: settingsOpen,
      }),
    [graph, root.id, settings.depth, settings.linkDistance, settings.clusterByRound, settings.nodeSize, allowedIds, descendants, settingsOpen],
  );

  const groupMatches = useMemo(
    () =>
      settings.groups.map((group) => ({
        group,
        result: evaluateQuery(graph, group.query),
      })),
    [graph, settings.groups],
  );

  const groupOf = useCallback(
    (nodeId: string): GroupColor | null => {
      for (const entry of groupMatches) {
        if (entry.result.kind === "ok" && entry.result.ids.has(nodeId)) return entry.group.color;
      }
      return null;
    },
    [groupMatches],
  );

  if (!layout) return <LocalGraphEmptyState graph={graph} />;

  const drawn = layout.nodes.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 bg-card">
        <LocalGraphCanvas layout={layout} groupOf={groupOf} showArrows={settings.lineageArrows} onCentre={onRoot} />

        <div className="pointer-events-none absolute left-6 top-5 flex max-w-[214px] flex-col gap-1.5 rounded-[11px] bg-card p-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
            Around {layout.root.label} · depth {settings.depth}
          </div>
          <p className="text-[11.5px] leading-[1.45] text-muted">
            {drawn} of {graph.nodes.length} nodes.{" "}
            {layout.descendants.countable
              ? "Node size is how many runs descend from it. Arrows point from parent to child."
              : "Arrows point from parent to child."}
          </p>
          {!layout.descendants.countable && layout.descendants.reason && (
            <p className="text-[10.5px] leading-[1.45] text-muted">{layout.descendants.reason}</p>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-[22px] left-6 flex max-w-[240px] flex-col gap-[7px] rounded-[11px] bg-card p-1.5">
          {groupMatches.map(({ group, result }) => (
            <div key={group.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-[7px] text-[11px] text-muted">
                <span className={cn("size-[11px] shrink-0 rounded-[6px]", GROUP_DOT_CLASS[group.color])} />
                <span className="min-w-0 flex-1 truncate font-plex-mono">{group.query || "no query"}</span>
                <span className="font-plex-mono">{result.kind === "ok" ? result.count : "—"}</span>
              </div>
              {(result.kind === "unbacked" || result.kind === "unparsed") && (
                <p className="pl-[18px] text-[10px] leading-[1.4] text-muted">{result.reason}</p>
              )}
            </div>
          ))}
          <div className="flex items-center gap-[7px] text-[11px] text-muted opacity-45">
            {/* Dashed, achromatic, heavier than a plain node outline - the
                house treatment for SOP marks (DESIGN.md, "Color roles"). */}
            <span className="size-[11px] shrink-0 rounded-[6px] border-[1.5px] border-dashed border-node-stroke bg-card" />
            SOP
            <span className="sr-only">, none in this graph</span>
          </div>
          {!sopAvailable && (
            <p className="text-[10px] leading-[1.4] text-muted">kalos reports no SOP or governance links, so that mark never appears.</p>
          )}
        </div>

        {settingsOpen && (
          <GraphSettingsPanel
            graph={graph}
            rootLabel={layout.root.label}
            settings={settings}
            onChange={update}
            onReset={() => update(DEFAULT_SETTINGS)}
            sopAvailable={sopAvailable}
          />
        )}
      </div>

      <div className="flex shrink-0 items-end gap-6 border-t border-border bg-card px-[26px] pb-[22px] pt-5">
        <p className="max-w-[56ch] font-serif text-[16px] leading-[1.5] text-fg [text-wrap:pretty]">
          {localNarrative(layout)}
        </p>
        <div className="ml-auto flex gap-2 whitespace-nowrap">
          <button
            type="button"
            onClick={() => onOpenRun(layout.root)}
            className="rounded-[10px] border border-border px-[13px] py-[9px] text-[12px] font-semibold text-fg transition-colors motion-reduce:transition-none hover:bg-blue-soft"
          >
            Open {layout.root.label}
          </button>
          <button
            type="button"
            disabled={settings.depth >= 3}
            onClick={() => update({ ...settings, depth: 3 })}
            className="rounded-[10px] bg-action px-[13px] py-[9px] text-[12px] font-semibold text-white transition-opacity motion-reduce:transition-none hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Widen to depth 3
          </button>
        </div>
      </div>
    </div>
  );
}
