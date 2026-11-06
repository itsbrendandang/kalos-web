"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Bot, FlaskRound, Network, Workflow, Database, FolderKanban, LayoutDashboard, Library, Search, Settings, type LucideIcon } from "lucide-react";
import { KalosMark } from "@/components/brand/kalos-mark";
import { StepDot } from "@/components/campaign/step-dot";
import { WorkspaceMenu } from "@/components/workbench/workspace-menu";
import { ExampleBadge } from "@/components/ui/badge";
import { useCampaignStage } from "@/hooks/use-campaign-stage";
import type { StageStep } from "@/lib/campaign-stage";
import { CAMPAIGN_STAGES, RAIL_GROUPS, navItem, navKeyFor, type NavKey } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Set at build time by desktop/prepare-web.sh: the engine is a local process on this Mac, not a service. */
const LOCAL = process.env.NEXT_PUBLIC_KALOS_LOCAL === "1";
const ENGINE_LINE = {
  connected: LOCAL ? "Engine running on this Mac" : "Connected to the engine",
  connecting: LOCAL ? "Starting the engine" : "Connecting to the engine",
  offline: LOCAL ? "Engine stopped. Retry" : "Engine unreachable. Retry",
} as const;

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

/**
 * The one sidebar: search, then every section always visible. Overview comes
 * first with the five stages listed under it (a StepDot says which are done,
 * which is current), then Tools and Workspace, then Settings, the research-use
 * line, the engine status and the workspace menu at the foot. Groups come from
 * RAIL_GROUPS in lib/routes.ts, which the command palette reads too.
 */
export function Sidebar({ onSearch, className }: { onSearch: () => void; className?: string }) {
  const pathname = usePathname();
  const section = navKeyFor(pathname);
  const shortcut = useShortcutLabel();
  const { stage, status, demo, retry } = useCampaignStage();
  const current = stage?.steps.find((x) => x.state === "current") ?? null;
  const doneCount = stage?.steps.filter((x) => x.state === "done").length ?? 0;

  const row = (active: boolean) =>
    cn(
      "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-body transition-colors",
      active ? "bg-fill-active font-medium text-fg" : "text-fg-muted hover:bg-fill-hover hover:text-fg",
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
        className="flex h-9 items-center gap-2 rounded-lg bg-fill-hover px-2.5 text-body text-fg-muted hover:bg-fill-active"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="font-sans text-caption">{shortcut}</kbd>
      </button>

      <nav aria-label="Sections" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pt-1">
        {RAIL_GROUPS.map((group) => (
          <div key={group.label ?? "overview"} className="flex flex-col gap-0.5">
            {group.label ? <p className="px-2.5 pb-1 text-caption text-fg-muted">{group.label}</p> : null}
            <ul className="flex flex-col gap-0.5">
              {group.keys.map((k) => {
                const n = navItem(k);
                const Icon = ICON[k];
                const isOverview = k === "campaign";
                // Overview's row lights up on the campaign section only when no stage row claims the path.
                const active = isOverview ? section === "campaign" && !pathname.startsWith("/campaign/") : section === k;
                return (
                  <li key={k}>
                    <Link
                      href={n.href}
                      aria-current={pathname === n.href ? "page" : undefined}
                      aria-label={isOverview && stage ? `Overview, ${doneCount} of ${stage.steps.length} stages done${current ? `, now ${current.label}` : ""}` : undefined}
                      className={row(active)}
                    >
                      <Icon className="size-[18px] shrink-0" aria-hidden />
                      <span className="flex-1">{n.label}</span>
                      {isOverview && current ? <span className="text-caption font-normal text-fg-muted">{current.label}</span> : null}
                    </Link>
                    {isOverview ? <StageRows pathname={pathname} steps={stage?.steps ?? null} /> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-border pt-2">
        <Link href="/settings" aria-current={section === "settings" ? "page" : undefined} className={row(section === "settings")}>
          <Settings className="size-[18px]" aria-hidden />
          Settings
        </Link>
        <p className="px-2.5 pb-1 text-caption text-fg-muted">Research use only. Suggestions are hypotheses to test, not settings to adopt.</p>
        <div className="flex items-center gap-1 pl-1">
          {status === "offline" ? (
            <button type="button" onClick={retry} className="flex h-9 flex-1 items-center gap-2 rounded-lg px-1.5 text-caption text-fg hover:bg-fill-hover">
              <span className="size-2 rounded-full bg-bad" aria-hidden />
              {ENGINE_LINE.offline}
            </button>
          ) : (
            <p className="flex h-9 flex-1 items-center gap-2 px-1.5 text-caption text-fg-muted">
              <span className={cn("size-2 rounded-full", status === "connected" ? "bg-good" : "animate-pulse bg-fg-muted")} aria-hidden />
              {ENGINE_LINE[status]}
            </p>
          )}
          <WorkspaceMenu side="right" className="size-8" />
        </div>
      </div>
    </div>
  );
}

/**
 * The five stages, indented under Overview. The current stage carries the
 * active fill (so does the page being viewed). Before the engine answers, the
 * rows still link but carry an "upcoming" mark, so the list never jumps in.
 */
function StageRows({ pathname, steps }: { pathname: string; steps: StageStep[] | null }) {
  return (
    <ul aria-label="Campaign stages" className="mt-0.5 flex flex-col gap-0.5">
      {CAMPAIGN_STAGES.map((s) => {
        const step = steps?.find((x) => x.key === s.key) ?? null;
        const state = step?.state ?? "upcoming";
        const here = pathname === s.href;
        return (
          <li key={s.key}>
            <Link
              href={s.href}
              aria-current={here ? "page" : undefined}
              aria-label={step ? `${s.label}, ${state === "done" ? "done" : state === "current" ? "current stage" : "upcoming"}: ${step.detail}` : s.label}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-lg py-0 pr-2.5 pl-[30px] text-label font-normal transition-colors",
                here || state === "current" ? "bg-fill-active text-fg" : "text-fg-muted hover:bg-fill-hover hover:text-fg",
                here && "font-medium",
              )}
            >
              <StepDot state={state} />
              {s.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
