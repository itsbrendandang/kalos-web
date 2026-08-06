import Link from "next/link";
import { Diamond } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceTab = "log" | "map" | "brief";

const TABS: { id: WorkspaceTab; label: string; suffix: string }[] = [
  { id: "log", label: "Log", suffix: "" },
  { id: "map", label: "Map", suffix: "/map" },
  { id: "brief", label: "Brief", suffix: "/brief" },
];

/** The 56px sticky workspace header (design spec section 1.2). Shared across
 *  Log/Map/Brief - only the active tab changes as the URL changes; a future
 *  Map-specific lens/mode switch is additive chrome the Map tab renders in
 *  the body, not something this shared header needs to know about. */
export function WorkspaceHeader({
  campaignId,
  campaignName,
  objective,
  activeTab,
  roundNumber,
  askOpen,
  onToggleAsk,
}: {
  campaignId: string;
  campaignName: string;
  objective: string;
  activeTab: WorkspaceTab;
  roundNumber: number | null;
  askOpen: boolean;
  onToggleAsk: () => void;
}) {
  return (
    <header className="box-border flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-8">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-[15px] font-bold tracking-[-0.015em] text-fg">{campaignName}</h1>
        <span className="truncate text-[12px] text-muted">{objective}</span>
      </div>

      <nav className="flex items-center gap-0.5 rounded-[10px] border border-blue-border bg-blue-tint p-[3px]">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={`/c/${campaignId}${tab.suffix}`}
            className={cn(
              "rounded-[7px] px-3 py-[5px] text-[12px]",
              tab.id === activeTab ? "bg-card font-semibold text-fg" : "text-muted hover:text-fg",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* The design puts a collaborator avatar stack ("AO / RM / JP / +2")
          immediately left of these controls. kalos models no people at all,
          so there is nobody on this campaign to draw and the stack is gone -
          the rail's identity slot is the one place that names the gap. */}
      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleAsk}
          aria-pressed={askOpen}
          className="flex items-center gap-[7px] rounded-[10px] border border-border bg-card px-[13px] py-1.5 text-[12px] font-semibold text-fg transition-colors hover:bg-blue-soft"
        >
          <span className="grid size-[15px] shrink-0 place-items-center rounded-lg bg-action text-white">
            <Diamond className="size-[8px]" fill="currentColor" />
          </span>
          Ask
        </button>
        {/* Sharing needs accounts and share links; kalos has neither, and no
            endpoint behind either. Left visibly disabled with the reason on
            it rather than rendered live and silently doing nothing. */}
        <button
          type="button"
          disabled
          title="Sharing needs accounts and share links, which kalos does not have yet."
          className="cursor-not-allowed rounded-[10px] border border-border bg-card px-[13px] py-1.5 text-[12px] font-semibold text-fg opacity-55"
        >
          Share
        </button>
        {/* The design's header approves the open round outright. Approving
            books runs into a physical lab against a specific batch, and the
            batch only exists on the Log tab - so this is navigation to the
            decision, not a second, batch-less copy of the write path. It was
            previously a filled primary button with no onClick at all. */}
        <Link
          href={`/c/${campaignId}`}
          className="rounded-[10px] bg-action px-[13px] py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          {roundNumber != null ? `Review round ${roundNumber}` : "Review batch"}
        </Link>
      </div>
    </header>
  );
}
