"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Database, FlaskConical, FolderKanban, Library, Menu, PanelLeftClose, PanelLeftOpen, PanelRightOpen, Search, Settings, X, type LucideIcon } from "lucide-react";
import { CommandPalette } from "@/components/workbench/command-palette";
import { ContextPanel } from "@/components/workbench/context-panel";
import { EngineStatus } from "@/components/workbench/engine-status";
import { SectionExplorer, useExplorerIsExample } from "@/components/workbench/explorer";
import { WorkspaceMenu } from "@/components/workbench/workspace-menu";
import { ProjectsStoreProvider } from "@/components/projects/store-context";
import { ExampleBadge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EngineDataProvider } from "@/hooks/use-engine";
import { NAV_ITEMS, navKeyFor, type NavKey } from "@/lib/routes";
import { createStorageStore } from "@/lib/storage-store";
import { cn } from "@/lib/utils";

const SECTION_ICON: Record<NavKey, LucideIcon> = {
  campaign: FlaskConical,
  data: Database,
  library: Library,
  projects: FolderKanban,
  settings: Settings,
};

/** The sections shown as pills in the top bar; Settings lives in the menu on the right. */
const PILLS = NAV_ITEMS.filter((n) => n.key !== "settings");

const sidebarCollapsed = createStorageStore("local", "kalos.explorer-collapsed", (raw) => raw === "true", false);
const contextCollapsed = createStorageStore("local", "kalos.context-collapsed", (raw) => raw === "true", false);
const MAIN_ID = "main";

/** The campaign context panel sits beside the stage pages and Data; Overview already is that context. */
function hasContextPanel(pathname: string): boolean {
  return pathname.startsWith("/campaign/") || pathname === "/data";
}

/**
 * The app-wide frame: a top bar (brand, section pills, engine status,
 * Settings), a grey sidebar with the section's tree, the page, and on wide
 * screens a campaign context panel on the right. On phones the pills and the
 * tree move into a sheet. Also mounts what every page shares: engine data,
 * the projects store, tooltips and the ⌘K palette.
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
  const collapsed = sidebarCollapsed.useValue();
  const contextHidden = contextCollapsed.useValue();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const toggleSidebar = useCallback(() => sidebarCollapsed.set(!sidebarCollapsed.get()), []);

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

  const hasSidebar = section !== "settings";
  const showSidebar = hasSidebar && !collapsed;
  const context = hasContextPanel(pathname);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-label text-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <TopBar
        section={section}
        sidebar={hasSidebar ? { open: showSidebar, toggle: toggleSidebar } : null}
        context={context && contextHidden ? () => contextCollapsed.set(false) : null}
        onOpenSheet={() => setSheetOpen(true)}
        onSearch={() => setPaletteOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        {showSidebar ? (
          <aside aria-label="Sidebar" className="hidden w-[280px] shrink-0 flex-col border-r border-border-strong bg-bg md:flex">
            <SidebarHeader section={section} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SectionExplorer section={section} />
            </div>
          </aside>
        ) : null}

        <main id={MAIN_ID} tabIndex={-1} className="min-w-0 min-h-0 flex-1 overflow-y-auto outline-none">
          <div className="mx-auto w-full max-w-[1120px] p-4 md:p-6 lg:px-8">{children}</div>
        </main>

        {context && !contextHidden ? <ContextPanel onClose={() => contextCollapsed.set(true)} /> : null}
      </div>

      <MobileSheet open={sheetOpen} onOpenChange={setSheetOpen} section={section} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onToggleExplorer={toggleSidebar} />
    </div>
  );
}

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere; ⌘K while rendering on the server. */
function useShortcutLabel(): string {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "⌘K",
  );
}

const ICON_BUTTON = "grid size-8 place-items-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg";

function TopBar({
  section,
  sidebar,
  context,
  onOpenSheet,
  onSearch,
}: {
  section: NavKey;
  sidebar: { open: boolean; toggle: () => void } | null;
  context: (() => void) | null;
  onOpenSheet: () => void;
  onSearch: () => void;
}) {
  const shortcut = useShortcutLabel();
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 md:px-4">
      <button type="button" onClick={onOpenSheet} aria-label="Open navigation" className={cn(ICON_BUTTON, "size-9 md:hidden")}>
        <Menu className="size-5" aria-hidden />
      </button>
      {sidebar ? (
        <button
          type="button"
          onClick={sidebar.toggle}
          aria-label={sidebar.open ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={sidebar.open}
          className={cn(ICON_BUTTON, "max-md:hidden")}
        >
          {sidebar.open ? <PanelLeftClose className="size-4" aria-hidden /> : <PanelLeftOpen className="size-4" aria-hidden />}
        </button>
      ) : null}
      <Link href="/" aria-label="Kalos, campaign overview" className="text-title font-normal tracking-tight whitespace-nowrap text-fg">
        Kalos
      </Link>

      <nav aria-label="Sections" className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
        <ul className="flex items-center gap-1.5">
          {PILLS.map((n) => {
            const active = n.key === section;
            return (
              <li key={n.key}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center rounded-lg px-3 text-body whitespace-nowrap",
                    active ? "bg-ink text-ink-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <EngineStatus />
        <button type="button" onClick={onSearch} aria-label={`Search pages and actions (${shortcut})`} className={ICON_BUTTON}>
          <Search className="size-4" aria-hidden />
        </button>
        {context ? (
          <button type="button" onClick={context} aria-label="Show campaign context" className={cn(ICON_BUTTON, "max-xl:hidden")}>
            <PanelRightOpen className="size-4" aria-hidden />
          </button>
        ) : null}
        <WorkspaceMenu />
      </div>
    </header>
  );
}

function SidebarHeader({ section }: { section: NavKey }) {
  const item = NAV_ITEMS.find((n) => n.key === section);
  const Icon = SECTION_ICON[section];
  const example = useExplorerIsExample(section);
  return (
    <div className="flex h-16 shrink-0 items-end gap-2 px-4 pb-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-selected text-fg">
        <Icon className="size-4" aria-hidden />
      </span>
      <h2 className="min-w-0 flex-1 truncate pb-0.5 text-body text-fg">{item?.label}</h2>
      {example ? <ExampleBadge className="mb-1 h-5" /> : null}
    </div>
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
          className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-xs flex-col border-r border-border-strong bg-bg shadow-popover transition-transform duration-200 data-ending-style:-translate-x-full data-starting-style:-translate-x-full md:hidden"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface pr-2 pl-4">
            <Dialog.Title className="text-title font-normal tracking-tight text-fg">Kalos</Dialog.Title>
            <Dialog.Close aria-label="Close navigation" className={cn(ICON_BUTTON, "size-9")}>
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <nav aria-label="Sections" className="border-b border-border p-3">
            <ul className="flex flex-col gap-1">
              {NAV_ITEMS.map((n) => {
                const Icon = SECTION_ICON[n.key];
                const active = n.key === section;
                return (
                  <li key={n.key}>
                    <Link
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-3 rounded-lg px-3 text-body",
                        active ? "bg-ink text-ink-fg" : "text-fg-muted hover:bg-subtle hover:text-fg",
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
