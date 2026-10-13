/*
 * Pure state for the Experiments hub's Live view: a VS Code-style workbench
 * (explorer tree, editor tabs, status bar) over the campaign the /decide loop
 * runs (kalos/docs/CAMPAIGN_LOOP.md). No React and no framework imports, so
 * every rule here is unit tested directly in __tests__/workbench.test.ts.
 */

import type { Campaign, CampaignRun, LatestResult } from "@/lib/api";

export type ActiveCampaign = Extract<Campaign, { has_campaign: true }>;

// --- What each fetch is allowed to claim ------------------------------------

/**
 * What the campaign side of the workbench may show. `err` wins over
 * everything else: a rejected fetch is always "error", even when an earlier
 * success left data behind, so a dropped connection is never rendered as a
 * fact about the lab ("no campaign", zero runs in flight). Demo data is only
 * ever shown when the engine confirmed there is no campaign AND demo mode is
 * on - never as a stand-in for a failed request.
 */
export type CampaignView =
  | { state: "loading" }
  | { state: "error" }
  | { state: "none" }
  | { state: "data"; campaign: ActiveCampaign; demo: boolean };

export function campaignView(
  campaign: Campaign | null,
  err: boolean,
  demoMode: boolean,
  demoCampaign: ActiveCampaign,
): CampaignView {
  if (err) return { state: "error" };
  if (campaign == null) return { state: "loading" };
  if (campaign.has_campaign) return { state: "data", campaign, demo: false };
  return demoMode ? { state: "data", campaign: demoCampaign, demo: true } : { state: "none" };
}

/** Same rule for the "next batch" proposals from /api/latest. */
export type QueueState = "loading" | "error" | "data";

export function queueState(data: LatestResult | null, err: boolean): QueueState {
  if (err) return "error";
  if (data == null) return "loading";
  return "data";
}

// --- Explorer ----------------------------------------------------------------

/** Started runs still waiting for a measured outcome. */
export const inFlight = (c: ActiveCampaign): CampaignRun[] => c.pending.filter((r) => r.awaiting);

/** Runs with a logged outcome, waiting to be folded in by the next re-analyze. */
export const measured = (c: ActiveCampaign): CampaignRun[] => c.pending.filter((r) => !r.awaiting);

/** Run ids are opaque engine ids (UUID-like); the explorer and tab titles
 *  show a short, stable prefix the way VS Code shows short commit hashes. */
export const shortId = (id: string): string => id.slice(0, 7);

export type SectionKey = "in-flight" | "measured" | "rounds";

// --- Editor tabs -------------------------------------------------------------

export type WorkbenchTab = { kind: "batch" } | { kind: "progress" } | { kind: "run"; runId: string };

export const tabKey = (t: WorkbenchTab): string => (t.kind === "run" ? `run:${t.runId}` : t.kind);

export type TabsState = { open: WorkbenchTab[]; active: string | null };

export const INITIAL_TABS: TabsState = { open: [{ kind: "batch" }, { kind: "progress" }], active: "batch" };

/** Focus the tab if it is already open, otherwise open it to the right of the
 *  active tab and focus it - VS Code's behavior. */
export function openTab(s: TabsState, tab: WorkbenchTab): TabsState {
  const key = tabKey(tab);
  if (s.open.some((t) => tabKey(t) === key)) return { ...s, active: key };
  const at = s.open.findIndex((t) => tabKey(t) === s.active);
  const open = [...s.open];
  open.splice(at === -1 ? open.length : at + 1, 0, tab);
  return { open, active: key };
}

/** Close a tab. Closing the active one focuses its right neighbor, else its
 *  left one, else nothing (the editor shows its empty state). */
export function closeTab(s: TabsState, key: string): TabsState {
  const at = s.open.findIndex((t) => tabKey(t) === key);
  if (at === -1) return s;
  const open = s.open.filter((_, i) => i !== at);
  if (s.active !== key) return { ...s, open };
  const next = open[at] ?? open[at - 1];
  return { open, active: next ? tabKey(next) : null };
}

/** Drop run tabs whose run no longer exists (folded into the base by a
 *  re-analyze, or gone with a fresh upload), so a tab never shows a run the
 *  campaign no longer has. */
export function pruneRunTabs(s: TabsState, runIds: ReadonlySet<string>): TabsState {
  let next = s;
  for (const t of s.open) {
    if (t.kind === "run" && !runIds.has(t.runId)) next = closeTab(next, tabKey(t));
  }
  return next;
}
