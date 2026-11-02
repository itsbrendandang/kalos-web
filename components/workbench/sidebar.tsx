"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ChevronRight, Bot, FlaskConical, FlaskRound, Network, Workflow, Database, FolderKanban, LayoutDashboard, Library, Search, Settings, type LucideIcon } from "lucide-react";
import { KalosMark } from "@/components/brand/kalos-mark";
import { WorkspaceMenu } from "@/components/workbench/workspace-menu";
import { ExampleBadge } from "@/components/ui/badge";
import { useCampaignStage } from "@/hooks/use-campaign-stage";
import { NAV_ITEMS, navKeyFor, type NavKey } from "@/lib/routes";
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

const MORE: NavKey[] = ["review", "process", "graph", "data", "library", "projects"];

function useShortcutLabel(): string {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "⌘K",
  );
}

/**
 * The one sidebar: search, the sections (Experiments is the one door to the
 * five-stage loop), and Settings, the menu and the engine status at the foot.
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

      <nav aria-label="Sections" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pt-1">
        <ul className="flex flex-col gap-0.5">
          {[
            { href: "/", label: "Overview", Icon: LayoutDashboard, active: pathname === "/" },
            {
              href: "/experiments",
              label: "Experiments",
              Icon: FlaskConical,
              active: pathname === "/experiments" || pathname.startsWith("/campaign/"),
              hint: current?.label,
              aria: stage ? `Experiments, ${doneCount} of ${stage.steps.length} stages done${current ? `, now ${current.label}` : ""}` : "Experiments",
            },
            { href: "/agent", label: "Agent", Icon: Bot, active: section === "agent" },
          ].map((n) => (
            <li key={n.href}>
              <Link href={n.href} aria-current={pathname === n.href ? "page" : undefined} aria-label={n.aria} className={row(n.active)}>
                <n.Icon className="size-[18px] shrink-0" aria-hidden />
                <span className="flex-1">{n.label}</span>
                {n.hint ? <span className="text-caption font-normal text-fg-muted">{n.hint}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
        <details open={MORE.includes(section)} className="group">
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2.5 rounded-lg px-2.5 text-body text-fg-muted hover:bg-fg/[0.05] hover:text-fg [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-[18px] shrink-0 transition-transform group-open:rotate-90" aria-hidden />
            More
          </summary>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {MORE.map((k) => {
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
        </details>
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-border pt-2">
        <Link href="/settings" aria-current={section === "settings" ? "page" : undefined} className={row(section === "settings")}>
          <Settings className="size-[18px]" aria-hidden />
          Settings
        </Link>
        <p className="px-2.5 pb-1 text-caption text-fg-muted">Research use only. Suggestions are hypotheses to test, not validated specifications.</p>
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
