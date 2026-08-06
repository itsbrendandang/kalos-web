// State model for the local-graph lens's settings panel (DESIGN_SPEC.md 5.3),
// persisted per campaign.
//
// Why persisted: the panel is a workbench, not a dialog. Someone who sets
// depth 3, turns arrows off and colours a group is describing how they want
// to read THIS campaign, and having that reset on every navigation would make
// the panel not worth opening. Scope is per campaign id for the same reason -
// two campaigns are two different reading problems.
//
// Storage is localStorage, read lazily and defensively: it is user preference,
// never data, so a corrupt or absent entry falls back to defaults silently
// rather than surfacing an error. Unknown/missing keys merge over the
// defaults, so a settings shape written by an older build still loads.
import type { LineageGraph } from "../map-types";

/** Palette for group dots. The first three are the spec's own (5.3): green
 *  for the high-titer group, amber for the failed group, and a dashed action
 *  outline for the round group. Values are token names, resolved to
 *  `var(--token)` at the render site - never a literal hex.
 *
 *  The set stops at four on purpose. DESIGN.md's colour-roles rule keeps
 *  chrome achromatic (only --chart-* and the heat ramps carry hue), so the
 *  only marks available here are the two status tokens the design already
 *  spends on this surface plus the neutral action fill in solid and dashed
 *  form. A fifth group re-uses a colour rather than inventing a hue. */
export type GroupColor = "green" | "amber" | "action-dashed" | "action";

export const GROUP_COLORS: GroupColor[] = ["green", "amber", "action-dashed", "action"];

export type GraphGroup = {
  id: string;
  color: GroupColor;
  query: string;
};

export type GraphSettings = {
  /** Hops from the centre run. */
  depth: number;
  /** Filters section's free query - dims/removes non-matching nodes. */
  filterQuery: string;
  /** Show SOP nodes. Inert today: kalos emits none (see map-types.ts). */
  showSop: boolean;
  /** Drop proposals and round hubs, leaving only runs with a measurement. */
  measuredOnly: boolean;
  groups: GraphGroup[];
  /** Draw the `marker-end` arrowheads on lineage edges. */
  lineageArrows: boolean;
  /** Multiplier on every non-centre node radius. */
  nodeSize: number;
  /** 0 = spread evenly around each ring, 1 = pull each round into its own
   *  wedge of the ring. */
  clusterByRound: number;
  /** Depth-1 ring radius in layout units; outer rings scale from it. */
  linkDistance: number;
};

/** Slider ranges. Chosen so the spec's own worked examples land on the exact
 *  fill percentages it records: depth 2 of 1-4 is 33%, cluster 0.7 of 0-1 is
 *  70%, link distance 120 of 65-165 is 55%, node size 1.0 of 0.4-1.65 is
 *  48%. */
export const SLIDER_RANGE = {
  depth: { min: 1, max: 4, step: 1 },
  nodeSize: { min: 0.4, max: 1.65, step: 0.05 },
  clusterByRound: { min: 0, max: 1, step: 0.05 },
  linkDistance: { min: 65, max: 165, step: 5 },
} as const;

export function fillPercent(value: number, range: { min: number; max: number }): number {
  const span = range.max - range.min;
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((value - range.min) / span) * 100));
}

export const DEFAULT_SETTINGS: GraphSettings = {
  depth: 2,
  filterQuery: "",
  showSop: true,
  measuredOnly: false,
  groups: [
    { id: "g-titer", color: "green", query: "titer >= 6.0" },
    { id: "g-failed", color: "amber", query: "status: failed" },
    { id: "g-round", color: "action-dashed", query: "round: 4" },
  ],
  lineageArrows: true,
  nodeSize: 1,
  clusterByRound: 0.7,
  linkDistance: 120,
};

const STORAGE_PREFIX = "kalos.map.graph-settings.";

function clampNumber(value: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, value));
}

function readGroups(value: unknown): GraphGroup[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.groups;
  const groups: GraphGroup[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.query !== "string") continue;
    const color = GROUP_COLORS.includes(record.color as GroupColor) ? (record.color as GroupColor) : "green";
    groups.push({ id: record.id, color, query: record.query });
  }
  return groups;
}

/** Merge a stored blob over the defaults, clamping every number into range.
 *  Exported separately from `loadSettings` so it is testable without a DOM. */
export function mergeSettings(stored: unknown): GraphSettings {
  if (typeof stored !== "object" || stored === null) return DEFAULT_SETTINGS;
  const record = stored as Record<string, unknown>;
  return {
    depth: Math.round(clampNumber(record.depth, SLIDER_RANGE.depth, DEFAULT_SETTINGS.depth)),
    filterQuery: typeof record.filterQuery === "string" ? record.filterQuery : DEFAULT_SETTINGS.filterQuery,
    showSop: typeof record.showSop === "boolean" ? record.showSop : DEFAULT_SETTINGS.showSop,
    measuredOnly: typeof record.measuredOnly === "boolean" ? record.measuredOnly : DEFAULT_SETTINGS.measuredOnly,
    groups: readGroups(record.groups),
    lineageArrows: typeof record.lineageArrows === "boolean" ? record.lineageArrows : DEFAULT_SETTINGS.lineageArrows,
    nodeSize: clampNumber(record.nodeSize, SLIDER_RANGE.nodeSize, DEFAULT_SETTINGS.nodeSize),
    clusterByRound: clampNumber(record.clusterByRound, SLIDER_RANGE.clusterByRound, DEFAULT_SETTINGS.clusterByRound),
    linkDistance: clampNumber(record.linkDistance, SLIDER_RANGE.linkDistance, DEFAULT_SETTINGS.linkDistance),
  };
}

/** Parse a stored blob. Any failure lands on defaults: this is preference,
 *  not data, so a corrupt entry is worth zero interruption. */
export function parseSettings(raw: string | null): GraphSettings {
  if (raw == null) return DEFAULT_SETTINGS;
  try {
    return mergeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// localStorage exposed as a `useSyncExternalStore` source rather than read in
// an effect: the server has no localStorage, so the stored value has to arrive
// through the one API that has a separate server snapshot, or the first client
// render disagrees with the server's HTML.
const listeners = new Set<() => void>();

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` fires for OTHER tabs; same-tab writes notify through `listeners`.
  if (typeof window !== "undefined") window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", listener);
  };
}

/** The raw stored string. A string (not a parsed object) so repeated calls
 *  return a referentially stable snapshot, which is what
 *  `useSyncExternalStore` requires to avoid an infinite render loop. */
export function readStoredSettings(campaignId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + campaignId);
  } catch {
    return null;
  }
}

/** Server snapshot: nothing is stored, so defaults. */
export function readServerSettings(): string | null {
  return null;
}

export function saveSettings(campaignId: string, settings: GraphSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + campaignId, JSON.stringify(settings));
  } catch {
    // Private-mode or quota failure. A preference that could not be saved is
    // not worth interrupting anyone over.
  }
  for (const listener of listeners) listener();
}

/** Next colour for a newly added group: the first one not already in use, so
 *  two groups only share a colour once every colour is taken. */
export function nextGroupColor(groups: readonly GraphGroup[]): GroupColor {
  const used = new Set(groups.map((g) => g.color));
  return GROUP_COLORS.find((c) => !used.has(c)) ?? GROUP_COLORS[groups.length % GROUP_COLORS.length];
}

/** Whether the SOP toggle can do anything at all. Read from the graph's own
 *  capability flag rather than hardcoded, so it lights up on its own the day
 *  an engine reports governance. */
export function sopIsAvailable(graph: LineageGraph): boolean {
  return graph.instrumented.sop;
}
