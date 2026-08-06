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
  refresh: () => void;
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
