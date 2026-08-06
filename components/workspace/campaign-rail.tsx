import Link from "next/link";
import { ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { DemoBadge } from "@/components/page-header";
import type { CampaignSummary } from "@/lib/workspace/types";

/** The campaign rail (design spec section 1.1 "Campaign rail"). Two states
 *  of the same `railOpen` boolean - no third state. Purely presentational:
 *  the parent (WorkspaceShell) owns fetching and persistence. */
export function CampaignRail({
  open,
  onToggle,
  campaigns,
  activeCampaignId,
  demo,
  evidence,
  onNewCampaign,
}: {
  open: boolean;
  onToggle: () => void;
  campaigns: CampaignSummary[];
  activeCampaignId: string;
  demo: boolean;
  evidence: { runsInRegistry: number; priorCampaigns: number; sopsIndexed: number } | null;
  /** Opens the upload dialog. The rail stays presentational: the shell owns
   *  the dialog and the refetch that follows a successful upload. */
  onNewCampaign: () => void;
}) {
  return (
    <aside
      className={cn(
        "box-border flex shrink-0 flex-col gap-[22px] border-r border-border bg-card",
        open ? "flex-[0_0_248px] px-3 py-5" : "flex-[0_0_62px] px-2 py-5",
      )}
    >
      {open ? (
        <ExpandedRail
          campaigns={campaigns}
          activeCampaignId={activeCampaignId}
          demo={demo}
          evidence={evidence}
          onToggle={onToggle}
          onNewCampaign={onNewCampaign}
        />
      ) : (
        <CollapsedRail
          campaigns={campaigns}
          activeCampaignId={activeCampaignId}
          onToggle={onToggle}
          onNewCampaign={onNewCampaign}
        />
      )}
    </aside>
  );
}

function RailTile({
  active,
  dashed,
  title,
  className,
  children,
}: {
  active?: boolean;
  dashed?: boolean;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      title={title}
      className={cn(
        "grid size-[34px] shrink-0 place-items-center rounded-[10px] font-mono text-[10.5px] font-semibold transition-colors",
        active ? "border border-blue-border bg-blue-tint text-fg" : "border border-transparent text-muted hover:border-border hover:bg-blue-soft hover:text-fg",
        dashed && "border border-dashed border-border text-muted hover:bg-blue-soft hover:text-fg",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CollapsedRail({
  campaigns,
  activeCampaignId,
  onToggle,
  onNewCampaign,
}: {
  campaigns: CampaignSummary[];
  activeCampaignId: string;
  onToggle: () => void;
  onNewCampaign: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center gap-4">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Expand campaign rail"
        className="grid size-[34px] place-items-center rounded-[10px] border border-border text-[13px] text-muted transition-colors hover:bg-blue-soft hover:text-fg"
      >
        »
      </button>
      <button
        type="button"
        aria-label="Open command palette"
        className="grid size-[34px] place-items-center rounded-[10px] border border-border font-mono text-[11px] text-muted transition-colors hover:bg-blue-soft hover:text-fg"
      >
        ⌘K
      </button>
      <div className="h-[26px] w-px bg-border" />
      {campaigns.map((c) => (
        <Link key={c.id} href={`/c/${c.id}`}>
          <RailTile active={c.id === activeCampaignId} title={c.name}>
            {c.monogram}
          </RailTile>
        </Link>
      ))}
      <button type="button" onClick={onNewCampaign} aria-label="New campaign">
        <RailTile dashed title="New campaign">
          <Plus className="size-[13px]" />
        </RailTile>
      </button>
      <div className="mt-auto grid size-[30px] place-items-center rounded-[15px] border border-blue-border bg-blue-tint font-mono text-[9.5px] font-semibold text-fg">
        AO
      </div>
    </div>
  );
}

function ExpandedRail({
  campaigns,
  activeCampaignId,
  demo,
  evidence,
  onToggle,
  onNewCampaign,
}: {
  campaigns: CampaignSummary[];
  activeCampaignId: string;
  demo: boolean;
  evidence: { runsInRegistry: number; priorCampaigns: number; sopsIndexed: number } | null;
  onToggle: () => void;
  onNewCampaign: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-[22px]">
      <div className="flex items-center gap-2 px-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[13.5px] font-bold tracking-[-0.01em] text-fg">
            <span className="truncate">Bioqore R&D</span>
            <ChevronDown className="size-3.5 shrink-0 font-normal text-muted" />
          </div>
          <div className="mt-px text-[11px] text-muted">Workspace</div>
        </div>
        {/* Design mock shows a control in this slot of the switcher row; per
            build instructions it's wired to the real theme toggle so dark
            mode stays reachable from the expanded rail. */}
        <ThemeToggle />
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse campaign rail"
          className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-border text-[13px] text-muted transition-colors hover:border-blue-border hover:bg-blue-soft hover:text-fg"
        >
          «
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-[10px] border border-border bg-blue-soft px-2.5 py-[7px]">
        <Search className="size-3.5 shrink-0 text-muted" />
        <span className="flex-1 text-[11.5px] text-muted">Search campaigns</span>
        <span className="font-mono text-[10px] text-muted">⌘K</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-2.5 pb-2 text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">Campaigns</div>
        <div className="flex flex-col gap-0.5 overflow-y-auto">
          {campaigns.map((c) => {
            const active = c.id === activeCampaignId;
            return (
              <Link
                key={c.id}
                href={`/c/${c.id}`}
                className={cn(
                  "rounded-[10px] p-2.5",
                  active ? "bg-blue-tint" : "border border-transparent hover:border-border hover:bg-blue-soft",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 shrink-0 rounded-[3px]", active ? "bg-action" : "bg-border")} />
                  <span className={cn("truncate text-[12.5px] tracking-[-0.005em]", active ? "font-semibold text-fg" : "text-fg")}>{c.name}</span>
                </div>
                <div className="mt-px pl-3 text-[11px] text-muted">{c.statusLine}</div>
              </Link>
            );
          })}
          {campaigns.length === 0 && <p className="px-2.5 py-2 text-[11.5px] text-muted">No campaigns yet.</p>}
          <button
            type="button"
            onClick={onNewCampaign}
            className="mt-1 flex items-center gap-1.5 rounded-[10px] border border-dashed border-border px-2.5 py-[9px] text-left text-[12px] text-muted transition-colors hover:bg-blue-soft hover:text-fg"
          >
            <Plus className="size-[13px] shrink-0" />
            New campaign
          </button>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <div className="border-t border-border pt-3.5">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-fg">
            Evidence available
            {demo && <DemoBadge />}
          </div>
          {evidence ? (
            <div className="flex flex-col gap-1.5">
              <EvidenceRow label="Runs in registry" value={evidence.runsInRegistry.toLocaleString()} />
              <EvidenceRow label="Prior campaigns" value={evidence.priorCampaigns.toLocaleString()} />
              <EvidenceRow label="SOPs indexed" value={evidence.sopsIndexed.toLocaleString()} />
            </div>
          ) : (
            <p className="text-[11px] leading-[1.5] text-muted">Evidence stats aren&apos;t instrumented yet.</p>
          )}
        </div>
        <div className="flex items-center gap-2 px-2">
          <div className="size-[26px] shrink-0 rounded-[13px] border border-blue-border bg-blue-tint" />
          <div className="min-w-0">
            <div className="truncate text-[11.5px] font-semibold text-fg">A. Okafor</div>
            <div className="text-[10.5px] text-muted">Process science</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-fg">{value}</span>
    </div>
  );
}
