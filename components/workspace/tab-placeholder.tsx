"use client";

import { DemoBadge } from "@/components/page-header";
import { useWorkspaceCampaign } from "@/lib/workspace/campaign-context";

/** Shared placeholder body for the Log/Map/Brief tabs. This intentionally
 *  renders almost nothing - the real content (the verdict hero, timeline,
 *  proposals card, and force-directed graphs) is a separate build. Reading
 *  campaign.name back out of context here is a deliberate end-to-end check:
 *  it proves the route -> layout -> WorkspaceShell -> adapter -> engine (or
 *  demo mock) pipe is actually live, not just that the shell renders. */
export function TabPlaceholder({ tab }: { tab: "Log" | "Map" | "Brief" }) {
  const { result } = useWorkspaceCampaign();
  const campaign = result.status === "ok" ? result.campaign : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      <div className="text-[13px] font-semibold text-fg">{tab} tab - not built yet</div>
      <p className="max-w-[52ch] text-[12.5px] leading-[1.5] text-muted">
        This is a structural placeholder for the campaign workspace redesign. The {tab.toLowerCase()} content lands in a
        follow-up pass.
      </p>
      {campaign && (
        <p className="mt-1 font-mono text-[11px] text-muted">
          Connected to &ldquo;{campaign.name}&rdquo; · round {campaign.currentRound}
          {result.status === "ok" && result.demo ? " " : ""}
        </p>
      )}
      {result.status === "ok" && result.demo && (
        <div className="mt-1">
          <DemoBadge />
        </div>
      )}
    </div>
  );
}
