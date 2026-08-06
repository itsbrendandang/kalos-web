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

      <div className="ml-auto flex items-center gap-2.5">
        <AvatarStack />
        <div className="h-5 w-px bg-border" />
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
        <button
          type="button"
          className="rounded-[10px] border border-border bg-card px-[13px] py-1.5 text-[12px] font-semibold text-fg transition-colors hover:bg-blue-soft"
        >
          Share
        </button>
        <button
          type="button"
          className="rounded-[10px] bg-action px-[13px] py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          {roundNumber != null ? `Approve round ${roundNumber}` : "Approve"}
        </button>
      </div>
    </header>
  );
}

const STACK: { initials: string; tone: "neutral" | "success" }[] = [
  { initials: "AO", tone: "neutral" },
  { initials: "RM", tone: "neutral" },
  { initials: "JP", tone: "success" },
];

function AvatarStack() {
  return (
    <div className="flex items-center" title="On this campaign">
      {STACK.map((p, i) => (
        <span
          key={p.initials}
          className={cn(
            "grid size-[25px] place-items-center rounded-[13px] border-[1.5px] border-card font-mono text-[9.5px] font-semibold",
            i > 0 && "-ml-[7px]",
            p.tone === "success" ? "bg-green-soft text-green" : "bg-blue-tint text-fg",
          )}
        >
          {p.initials}
        </span>
      ))}
      <span
        className="-ml-[7px] grid size-[25px] place-items-center rounded-[13px] bg-card text-[9.5px] text-muted outline outline-1 -outline-offset-1 outline-border"
      >
        +2
      </span>
    </div>
  );
}
