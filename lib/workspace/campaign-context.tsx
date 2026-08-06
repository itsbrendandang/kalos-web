"use client";

import { createContext, useContext } from "react";
import type { WorkspaceCampaignResult } from "./adapter";

export type WorkspaceCampaignContextValue = {
  campaignId: string;
  /** The current campaign fetch. WorkspaceShell only renders {children} once
   *  this is "ok" (its loading/unavailable/not-found states short-circuit
   *  before the tab body ever mounts), so consumers can treat `result.status`
   *  as always "ok" in practice - it's still typed as the full union so a
   *  future consumer racing a refresh can't assume that unsoundly. */
  result: WorkspaceCampaignResult;
  /** Re-read the campaign, showing the full-page loading state while it runs.
   *  For the "engine unavailable, try again" button, where the reader asked
   *  for a refetch and should see one happening. */
  refresh: () => void;
  /** Re-read the campaign in place, keeping the current view mounted, and
   *  resolve when the new data has landed. Every mutation awaits this before
   *  reporting success, so the UI only ever shows state the engine confirmed
   *  - blanking the whole workspace after each write would be both a worse
   *  experience and a worse signal (it looks like a navigation, not a
   *  result). */
  reload: () => Promise<void>;
  /** Re-read the rail's campaign list. Its per-campaign status line carries
   *  the round and the awaiting count, so any write that moves either would
   *  otherwise leave the rail quietly contradicting the tab beside it. */
  reloadCampaigns: () => Promise<void>;
  /** Bumped by every `reload()`. Tab bodies that hold their OWN engine reads
   *  (the Log tab's analysis, activity and timeline) key their fetch effect
   *  off this, so one write refreshes everything on the page instead of
   *  leaving each block to be remembered individually - and a surface added
   *  later cannot forget to opt in. */
  dataVersion: number;
};

const WorkspaceCampaignContext = createContext<WorkspaceCampaignContextValue | null>(null);

export function WorkspaceCampaignProvider({
  value,
  children,
}: {
  value: WorkspaceCampaignContextValue;
  children: React.ReactNode;
}) {
  return <WorkspaceCampaignContext.Provider value={value}>{children}</WorkspaceCampaignContext.Provider>;
}

/** Read the current campaign from within a Log/Map/Brief tab body. Throws
 *  outside app/c/[campaignId]/** on purpose - that's a real wiring bug, not
 *  a case to degrade gracefully from. */
export function useWorkspaceCampaign(): WorkspaceCampaignContextValue {
  const ctx = useContext(WorkspaceCampaignContext);
  if (!ctx) throw new Error("useWorkspaceCampaign must be called from within app/c/[campaignId] (see WorkspaceShell).");
  return ctx;
}
