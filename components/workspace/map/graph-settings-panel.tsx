"use client";

// The local-graph lens's floating settings panel (DESIGN_SPEC.md 5.3).
//
// 266px, radius 14, hairline border, hairline-separated sections each headed
// by a 10px uppercase label - the geometry is transcribed from the spec, not
// approximated, including the 30x17 toggle pill with its 12px knob and the
// 1px slider track with its 13px handle at translateX(-50%).
//
// The one place this panel departs from the mock is where a control cannot do
// what it appears to do. The SOP toggle is the example: kalos models no SOP or
// governance concept at all, so there are no SOP nodes to show or hide. A
// toggle that flips happily while changing nothing is a small lie told every
// time someone clicks it, so it renders visibly inert with the reason next to
// it - and it un-inerts itself the day the graph reports `instrumented.sop`.
import { useId } from "react";
import { cn } from "@/lib/utils";
import { evaluateQuery, type QueryResult } from "@/lib/workspace/graph/graph-query";
import {
  SLIDER_RANGE,
  fillPercent,
  nextGroupColor,
  type GraphGroup,
  type GraphSettings,
  type GroupColor,
} from "@/lib/workspace/graph/graph-settings";
import type { LineageGraph } from "@/lib/workspace/map-types";

export const GROUP_DOT_CLASS: Record<GroupColor, string> = {
  green: "bg-green border border-green",
  amber: "bg-amber border border-amber",
  "action-dashed": "bg-card border border-dashed border-action",
  action: "bg-action border border-action",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">{children}</div>;
}

function Section({ first = false, children }: { first?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-[9px]", first ? "" : "border-t border-border pt-[11px]")}>{children}</div>
  );
}

/** 30x17 pill, 12px knob, per the spec's toggle geometry. `inert` is not
 *  `disabled` with a different name: it means the control is real but has
 *  nothing to act on, and it always renders the reason. */
function Toggle({
  label,
  checked,
  onChange,
  inert,
  reason,
  note,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  inert?: boolean;
  reason?: string;
  /** Shown while the toggle is ON, for a filter whose exact reach is worth
   *  spelling out rather than leaving the reader to infer from the canvas. */
  note?: string;
}) {
  const on = inert ? false : checked;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-disabled={inert || undefined}
        disabled={inert}
        onClick={() => onChange(!checked)}
        className="flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed"
      >
        <span className={cn("text-[11.5px]", on ? "text-fg" : "text-muted")}>{label}</span>
        <span
          className={cn(
            "box-border flex h-[17px] w-[30px] shrink-0 items-center rounded-[9px] border px-[2px]",
            on ? "border-action bg-action" : "border-border bg-card",
            inert && "opacity-50",
          )}
        >
          <span
            className={cn(
              "size-3 rounded-md transition-transform motion-reduce:transition-none",
              on ? "bg-white" : "bg-border",
            )}
            style={{ transform: on ? "translateX(12px)" : "none" }}
          />
        </span>
      </button>
      {inert && reason && <p className="text-[10.5px] leading-[1.4] text-muted">{reason}</p>}
      {!inert && on && note && <p className="text-[10.5px] leading-[1.4] text-muted">{note}</p>}
    </div>
  );
}

/** 13px track area: 1px base line, 1px fill line, 13px handle centred on the
 *  fill percentage. A transparent `<input type="range">` is laid over the top
 *  so dragging, clicking the track, and full keyboard control all work and the
 *  control is announced properly - the visible parts are pure decoration. */
function Slider({
  label,
  value,
  display,
  range,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  range: { min: number; max: number; step: number };
  onChange: (next: number) => void;
}) {
  const id = useId();
  const pct = fillPercent(value, range);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[11.5px] text-muted">
          {label}
        </label>
        <span className="tabular font-plex-mono text-[11px] text-fg">{display}</span>
      </div>
      <div className="relative h-[13px]">
        <div className="absolute inset-x-0 top-[6px] h-px bg-border" />
        <div className="absolute left-0 top-[6px] h-px bg-action" style={{ width: `${pct}%` }} />
        <div
          className="pointer-events-none absolute top-0 box-border size-[13px] -translate-x-1/2 rounded-[7px] border-[1.5px] border-action bg-card"
          style={{ left: `${pct}%` }}
        />
        <input
          id={id}
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute -top-1.5 left-0 h-6 w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>
    </div>
  );
}

function QueryNote({ result }: { result: QueryResult }) {
  if (result.kind === "unbacked" || result.kind === "unparsed") {
    return <p className="text-[10.5px] leading-[1.4] text-muted">{result.reason}</p>;
  }
  return null;
}

function GroupRow({
  group,
  graph,
  onChange,
  onRemove,
}: {
  group: GraphGroup;
  graph: LineageGraph;
  onChange: (next: GraphGroup) => void;
  onRemove: () => void;
}) {
  const result = evaluateQuery(graph, group.query);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-[9px]">
        <span className={cn("size-[11px] shrink-0 rounded-[6px]", GROUP_DOT_CLASS[group.color])} />
        <input
          value={group.query}
          onChange={(e) => onChange({ ...group, query: e.target.value })}
          placeholder="titer >= 6.0"
          aria-label="Group query"
          className="min-w-0 flex-1 bg-transparent font-plex-mono text-[11px] text-fg outline-none placeholder:text-muted"
        />
        <span className="shrink-0 font-plex-mono text-[11px] text-muted">
          {result.kind === "ok" ? result.count : result.kind === "empty" ? "" : "—"}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove group ${group.query || "(empty)"}`}
          className="shrink-0 text-[11px] leading-none text-muted transition-colors hover:text-fg"
        >
          ×
        </button>
      </div>
      <QueryNote result={result} />
    </div>
  );
}

export function GraphSettingsPanel({
  graph,
  rootLabel,
  settings,
  onChange,
  onReset,
  sopAvailable,
}: {
  graph: LineageGraph;
  rootLabel: string;
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
  onReset: () => void;
  sopAvailable: boolean;
}) {
  const patch = (next: Partial<GraphSettings>) => onChange({ ...settings, ...next });
  const filterResult = evaluateQuery(graph, settings.filterQuery);

  return (
    <aside
      aria-label="Graph settings"
      className="absolute bottom-5 right-5 top-5 box-border flex w-[266px] flex-col gap-[11px] overflow-hidden rounded-[14px] border border-border bg-card p-[15px] pb-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12.5px] font-bold text-fg">Graph settings</h2>
        <button type="button" onClick={onReset} className="text-[11px] text-muted transition-colors hover:text-fg">
          Reset
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[11px] overflow-y-auto">
        <Section first>
          <SectionLabel>Depth</SectionLabel>
          <Slider
            label={`Hops from ${rootLabel}`}
            value={settings.depth}
            display={`${settings.depth}`}
            range={SLIDER_RANGE.depth}
            onChange={(depth) => patch({ depth: Math.round(depth) })}
          />
        </Section>

        <Section>
          <SectionLabel>Filters</SectionLabel>
          <input
            value={settings.filterQuery}
            onChange={(e) => patch({ filterQuery: e.target.value })}
            placeholder="titer > 5.5"
            aria-label="Filter query"
            className="box-border w-full rounded-[9px] border border-border bg-card px-[10px] py-2 font-plex-mono text-[11px] text-fg outline-none placeholder:text-muted focus:border-action"
          />
          <QueryNote result={filterResult} />
          <Toggle
            label="SOP nodes"
            checked={settings.showSop}
            onChange={(showSop) => patch({ showSop })}
            inert={!sopAvailable}
            reason="kalos models no SOP or governance concept, so there are no SOP nodes for this to show or hide."
          />
          <Toggle
            label="Measured runs only"
            checked={settings.measuredOnly}
            onChange={(measuredOnly) => patch({ measuredOnly })}
            note="Proposals drop out. Round hubs stay - they are scaffolding, not runs."
          />
        </Section>

        <Section>
          <SectionLabel>Groups</SectionLabel>
          {settings.groups.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              graph={graph}
              onChange={(next) => patch({ groups: settings.groups.map((g) => (g.id === next.id ? next : g)) })}
              onRemove={() => patch({ groups: settings.groups.filter((g) => g.id !== group.id) })}
            />
          ))}
          <button
            type="button"
            onClick={() =>
              patch({
                groups: [
                  ...settings.groups,
                  { id: `g-${Date.now().toString(36)}`, color: nextGroupColor(settings.groups), query: "" },
                ],
              })
            }
            className="self-start text-[11.5px] text-muted transition-colors hover:text-fg"
          >
            ＋ New group
          </button>
        </Section>

        <Section>
          <SectionLabel>Display</SectionLabel>
          <Toggle
            label="Lineage arrows"
            checked={settings.lineageArrows}
            onChange={(lineageArrows) => patch({ lineageArrows })}
          />
          <Slider
            label="Node size"
            value={settings.nodeSize}
            display={settings.nodeSize.toFixed(1)}
            range={SLIDER_RANGE.nodeSize}
            onChange={(nodeSize) => patch({ nodeSize })}
          />
        </Section>

        <Section>
          <SectionLabel>Forces</SectionLabel>
          <Slider
            label="Cluster by round"
            value={settings.clusterByRound}
            display={settings.clusterByRound.toFixed(1)}
            range={SLIDER_RANGE.clusterByRound}
            onChange={(clusterByRound) => patch({ clusterByRound })}
          />
          <Slider
            label="Link distance"
            value={settings.linkDistance}
            display={`${settings.linkDistance}`}
            range={SLIDER_RANGE.linkDistance}
            onChange={(linkDistance) => patch({ linkDistance })}
          />
        </Section>
      </div>
    </aside>
  );
}
