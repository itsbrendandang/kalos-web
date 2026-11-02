"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Bot, Check, FlaskRound, Network, Workflow, Database, FolderKanban, LayoutDashboard, Library, Search, Settings, type LucideIcon } from "lucide-react";
import { KalosMark } from "@/components/brand/kalos-mark";
import { WorkspaceMenu } from "@/components/workbench/workspace-menu";
import { ExampleBadge } from "@/components/ui/badge";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { campaignStage, type StepState } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { NAV_ITEMS, navKeyFor, type NavKey } from "@/lib/routes";
import { campaignView } from "@/lib/workbench";
import { cn } from "@/lib/utils";

const ICON: Record<NavKey, LucideIcon> = {
  campaign: LayoutDashboard,
  agent: Bot,
  review: FlaskRound,
  process: Workflow,
  graph: Network,
  data: Database,
  library: Library,
  projects: FolderKanban,
  settings: Settings,
};

function useShortcutLabel(): string {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "⌘K",
  );
}

function useStages() {
  const latest = useLatest();
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const failed = view.state === "error" || latest.status === "error";
  const ready = !failed && view.state !== "loading" && latest.data != null;
  const demo = view.state === "data" && view.demo;
  const active = view.state === "data" ? view.campaign : null;
  const stage = ready ? campaignStage(demo ? { has_data: true } : latest.data!, active ?? { has_campaign: false }) : null;
  const status: "connected" | "connecting" | "offline" = failed ? "offline" : ready ? "connected" : "connecting";
  return { steps: stage?.steps ?? null, status, demo, retry: () => { void latest.refresh(); void campaign.refresh(); } };
}

function StepDot({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <span className="grid size-4 place-items-center rounded-full bg-good text-bg">
        <Check className="size-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  if (state === "current") return <span className="size-4 rounded-full border-[5px] border-accent" aria-hidden />;
  return <span className="size-4 rounded-full border-[1.5px] border-border-strong" aria-hidden />;
}

/**
 * The one sidebar: search, the sections, the campaign's five stages nested under
 * Campaign, and Settings, the menu and the engine status at the foot.
 */
export function Sidebar({ onSearch, className }: { onSearch: () => void; className?: string }) {
  const pathname = usePathname();
  const section = navKeyFor(pathname);
  const shortcut = useShortcutLabel();
  const { steps, status, demo, retry } = useStages();

  const row = (active: boolean) =>
    cn(
      "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-body transition-colors",
      active ? "bg-fg/[0.07] font-medium text-fg" : "text-fg-muted hover:bg-fg/[0.05] hover:text-fg",
    );

  return (
    <div className={cn("flex h-full flex-col gap-3 p-3", className)}>
      <div className="flex items-center gap-2.5 px-1.5 pt-1">
        <Link href="/" aria-label="Kalos, campaign overview" className="flex items-center gap-2 text-fg">
          <KalosMark className="size-8" />
          <span className="text-heading tracking-wide">Kalos</span>
        </Link>
        {demo ? <ExampleBadge className="ml-auto h-5" /> : null}
      </div>

      <button
        type="button"
        onClick={onSearch}
        aria-label={`Search pages and actions (${shortcut})`}
        className="flex h-9 items-center gap-2 rounded-lg bg-fg/[0.05] px-2.5 text-body text-fg-muted hover:bg-fg/[0.08]"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="font-sans text-caption">{shortcut}</kbd>
      </button>

      <nav aria-label="Sections" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pt-1">
        <section aria-labelledby="nav-campaign">
          <h2 id="nav-campaign" className="mb-1 px-2.5 text-caption font-medium text-fg-muted">
            Campaign
          </h2>
          <ul className="flex flex-col gap-0.5">
            <li>
              <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={row(pathname === "/")}>
                <LayoutDashboard className="size-[18px] shrink-0" aria-hidden />
                Overview
              </Link>
            </li>
            {steps?.map((s, i) => {
              const here = pathname === s.href;
              return (
                <li key={s.key} className={cn(i === 0 && "mt-1")}>
                  <Link
                    href={s.href}
                    aria-current={here ? "page" : undefined}
                    aria-label={`${s.label}, ${s.state}${s.detail ? `: ${s.detail}` : ""}`}
                    className={cn(row(here), "gap-3 pl-3")}
                  >
                    <StepDot state={s.state} />
                    <span className="flex-1">{s.label}</span>
                    {s.detail && s.state === "current" ? <span className="max-w-24 truncate text-caption font-normal text-fg-muted">{s.detail}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <section aria-labelledby="nav-assistant">
          <h2 id="nav-assistant" className="mb-1 px-2.5 text-caption font-medium text-fg-muted">
            Assistant
          </h2>
          <ul className="flex flex-col gap-0.5">
            {(["agent", "review", "process", "graph"] as const).map((k) => {
              const n = NAV_ITEMS.find((x) => x.key === k)!;
              const Icon = ICON[k];
              return (
                <li key={k}>
                  <Link href={n.href} aria-current={pathname === n.href ? "page" : undefined} className={row(section === k)}>
                    <Icon className="size-[18px] shrink-0" aria-hidden />
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <section aria-labelledby="nav-reference">
          <h2 id="nav-reference" className="mb-1 px-2.5 text-caption font-medium text-fg-muted">
            Reference
          </h2>
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.filter((n) => n.key !== "settings" && n.key !== "campaign" && n.key !== "agent" && n.key !== "graph" && n.key !== "process" && n.key !== "review").map((n) => {
              const Icon = ICON[n.key];
              const active = n.key === section;
              return (
                <li key={n.key}>
                  <Link href={n.href} aria-current={active && pathname === n.href ? "page" : undefined} className={row(active)}>
                    <Icon className="size-[18px] shrink-0" aria-hidden />
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-border pt-2">
        <Link href="/settings" aria-current={section === "settings" ? "page" : undefined} className={row(section === "settings")}>
          <Settings className="size-[18px]" aria-hidden />
          Settings
        </Link>
        <div className="flex items-center gap-1 pl-1">
          {status === "offline" ? (
            <button type="button" onClick={retry} className="flex h-9 flex-1 items-center gap-2 rounded-lg px-1.5 text-caption text-fg hover:bg-fg/[0.05]">
              <span className="size-2 rounded-full bg-bad" aria-hidden />
              Engine offline. Retry
            </button>
          ) : (
            <p className="flex h-9 flex-1 items-center gap-2 px-1.5 text-caption text-fg-muted">
              <span className={cn("size-2 rounded-full", status === "connected" ? "bg-good" : "animate-pulse bg-fg-muted")} aria-hidden />
              {status === "connected" ? "Engine running on this device" : "Starting engine"}
            </p>
          )}
          <WorkspaceMenu side="right" className="size-8" />
        </div>
      </div>
    </div>
  );
}
