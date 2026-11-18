"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronRight, Database, FlaskConical, FolderKanban, Library, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, X, type LucideIcon } from "lucide-react";
import { CommandPalette } from "@/components/workbench/command-palette";
import { SectionExplorer, useExplorerIsExample } from "@/components/workbench/explorer";
import { StatusBar } from "@/components/workbench/status-bar";
import { WorkspaceMenu } from "@/components/workbench/workspace-menu";
import { WorkflowNav } from "@/components/workbench/workflow-nav";
import { ProcessGuide } from "@/components/workbench/process-guide";
import { ProjectsStoreProvider, useProjectsStore } from "@/components/projects/store-context";
import { ExampleBadge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EngineDataProvider } from "@/hooks/use-engine";
import { breadcrumbFor, NAV_ITEMS, navKeyFor, titleFor, type NavKey, type RouteItem } from "@/lib/routes";
import { createStorageStore } from "@/lib/storage-store";
import { cn } from "@/lib/utils";

const SECTION_ICON: Record<NavKey, LucideIcon> = {
  campaign: FlaskConical,
  data: Database,
  library: Library,
  projects: FolderKanban,
  settings: Settings,
};

const explorerCollapsed = createStorageStore("local", "kalos.explorer-collapsed", (raw) => raw === "true", false);
const MAIN_ID = "main";

/**
 * A compact workspace sidebar with section links and a contextual explorer,
 * a quiet breadcrumb header, and the page. On phones navigation is a sheet.
 * Also mounts what every page shares: engine data, the projects store,
 * tooltips and the ⌘K palette.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <EngineDataProvider>
      <ProjectsStoreProvider>
        <TooltipProvider delay={300}>
          <Frame>{children}</Frame>
        </TooltipProvider>
      </ProjectsStoreProvider>
    </EngineDataProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const section = navKeyFor(pathname);
  const collapsed = explorerCollapsed.useValue();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { customers } = useProjectsStore();
  const toggleExplorer = useCallback(() => explorerCollapsed.set(!explorerCollapsed.get()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tabTitle = (href: string) => {
    const m = href.match(/^\/projects\/([^/]+)(\/report)?$/);
    const project = m ? customers.flatMap((c) => c.projects).find((p) => p.id === m[1]) : undefined;
    if (project) return m?.[2] ? `${project.name} report` : project.name;
    return titleFor(href);
  };
  const crumbs: RouteItem[] = breadcrumbFor(pathname);
  if (crumbs[crumbs.length - 1].href !== pathname) crumbs.push({ href: pathname, label: tabTitle(pathname), description: "" });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-label text-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <MobileTopBar onOpenSheet={() => setSheetOpen(true)} onSearch={() => setPaletteOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <WorkspaceSidebar section={section} collapsed={collapsed} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4 md:h-12 md:px-6">
              <button
                type="button"
                onClick={toggleExplorer}
                aria-label={collapsed ? "Show explorer" : "Hide explorer"}
                aria-expanded={!collapsed}
                aria-controls="workspace-sidebar"
                className="-ml-1 hidden size-8 place-items-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg md:grid"
              >
                {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
              </button>
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex items-center gap-1 text-caption text-fg-muted">
                {crumbs.map((c, i) => {
                  const last = i === crumbs.length - 1;
                  return (
                    <li key={c.href} className="flex min-w-0 items-center gap-1">
                      {i > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : null}
                      {last ? (
                        <span aria-current="page" className="truncate text-fg">
                          {c.label}
                        </span>
                      ) : (
                        <Link href={c.href} className="truncate hover:text-fg hover:underline">
                          {c.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search workspace"
              className="ml-auto hidden items-center gap-2 rounded-md px-2 py-1.5 text-caption text-fg-muted hover:bg-subtle md:inline-flex"
            >
              <Search className="size-3.5" aria-hidden />
              Find a tool
              <kbd className="rounded border border-border px-1 font-sans text-[10px]">⌘ / Ctrl K</kbd>
            </button>
          </div>
          <main id={MAIN_ID} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
            <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-9 lg:px-10"><WorkflowNav pathname={pathname} />{pathname !== "/" ? <div className="mb-7"><ProcessGuide pathname={pathname} /></div> : null}{children}</div>
          </main>
        </div>
      </div>

      <StatusBar />

      <MobileSheet open={sheetOpen} onOpenChange={setSheetOpen} section={section} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onToggleExplorer={toggleExplorer} />
    </div>
  );
}

function WorkspaceSidebar({ section, collapsed }: { section: NavKey; collapsed: boolean }) {
  const example = useExplorerIsExample(section);
  const item = (n: (typeof NAV_ITEMS)[number]) => {
    const Icon = SECTION_ICON[n.key];
    const active = n.key === section;
    return (
      <Tooltip key={n.key}>
        <TooltipTrigger
          render={
            <Link
              href={n.href}
              aria-label={n.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-lg px-3 text-body focus-visible:outline-ring",
                collapsed ? "justify-center px-0" : "w-full",
                active ? "bg-brand font-medium text-brand-fg" : "text-fg-muted hover:bg-border/40 hover:text-fg",
              )}
            />
          }
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {!collapsed ? <span>{n.key === "campaign" ? "Workspace" : n.label}</span> : null}
        </TooltipTrigger>
        <TooltipContent side="right">{n.label}</TooltipContent>
      </Tooltip>
    );
  };
  return (
    <aside id="workspace-sidebar" aria-label="Workspace navigation" className={cn("hidden shrink-0 flex-col border-r border-border bg-subtle md:flex", collapsed ? "w-16" : "w-56")}>
      <Link href="/" aria-label="Kalos, campaign overview" className={cn("flex h-16 shrink-0 items-center gap-2.5 px-5 text-lg font-semibold text-fg", collapsed && "justify-center px-0")}>
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand text-xl font-medium text-brand-fg">k</span>
        {!collapsed ? <span>Kalos<span className="ml-1 text-fg-muted">.</span></span> : null}
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
        <nav aria-label="Sections" className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.filter((n) => n.key !== "settings").map(item)}
        </nav>
        {!collapsed && section !== "settings" ? (
          <section aria-label="Explorer" className="mt-6">
            <div className="mb-2 flex items-center gap-2 px-5 text-caption text-fg-muted">
              <h2>{{ campaign: "Experiment cycle", data: "Datasets", library: "Tool library", projects: "Client projects" }[section]}</h2>
              {example ? <ExampleBadge className="h-5" /> : null}
            </div>
            <SectionExplorer section={section} />
          </section>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-1 border-t border-border p-3">
        <nav aria-label="Workspace settings">{NAV_ITEMS.filter((n) => n.key === "settings").map(item)}</nav>
        <div className={cn("flex items-center gap-2", collapsed ? "justify-center" : "pl-3")}>
          {!collapsed ? <span className="flex-1 text-caption text-fg-muted">Kalos workspace</span> : null}
          <WorkspaceMenu />
        </div>
      </div>
    </aside>
  );
}

function MobileTopBar({ onOpenSheet, onSearch }: { onOpenSheet: () => void; onSearch: () => void }) {
  // A header, so the mobile bar is a banner landmark (axe "region": content outside landmarks).
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-subtle px-2 md:hidden">
      <button type="button" onClick={onOpenSheet} aria-label="Open navigation" className="grid size-9 place-items-center rounded-lg text-fg hover:bg-surface">
        <Menu className="size-5" aria-hidden />
      </button>
      <Link href="/" className="px-1 text-heading text-fg">
        Kalos
      </Link>
      <span className="flex-1" />
      <button type="button" onClick={onSearch} aria-label="Search pages and actions" className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface hover:text-fg">
        <Search className="size-5" aria-hidden />
      </button>
      <WorkspaceMenu side="bottom" />
    </header>
  );
}

function MobileSheet({ open, onOpenChange, section }: { open: boolean; onOpenChange: (open: boolean) => void; section: NavKey }) {
  const example = useExplorerIsExample(section);
  // Following any link (or opening a tree leaf with the keyboard) closes the sheet.
  const closeOnNavigate = (target: EventTarget) => {
    if (target instanceof Element && target.closest("a")) onOpenChange(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 md:hidden dark:bg-black/60" />
        <Dialog.Popup
          aria-label="Navigation"
          onClickCapture={(e) => closeOnNavigate(e.target)}
          onKeyDownCapture={(e) => {
            if (e.key === "Enter" || e.key === " ") closeOnNavigate(e.target);
          }}
          className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-xs flex-col border-r border-border bg-subtle shadow-popover transition-transform duration-200 data-ending-style:-translate-x-full data-starting-style:-translate-x-full md:hidden"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border pr-2 pl-4">
            <Dialog.Title className="text-heading text-fg">Kalos</Dialog.Title>
            <Dialog.Close aria-label="Close navigation" className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface hover:text-fg">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <nav aria-label="Sections" className="border-b border-border p-2">
            <ul className="flex flex-col gap-px">
              {NAV_ITEMS.map((n) => {
                const Icon = SECTION_ICON[n.key];
                const active = n.key === section;
                return (
                  <li key={n.key}>
                    <Link
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-3 rounded-lg border px-2.5 text-label",
                        active ? "border-border bg-surface text-fg" : "border-transparent text-fg-muted hover:bg-surface hover:text-fg",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {section !== "settings" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {example ? (
                <div className="px-4 pt-3">
                  <ExampleBadge />
                </div>
              ) : null}
              <SectionExplorer section={section} />
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
