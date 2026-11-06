"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu, Search } from "lucide-react";
import { ResearchFooter } from "@/components/brand/research-footer";
import { CommandPalette } from "@/components/workbench/command-palette";
import { Sidebar } from "@/components/workbench/sidebar";
import { WorkspaceMenu } from "@/components/workbench/workspace-menu";
import { ProjectsStoreProvider } from "@/components/projects/store-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EngineDataProvider } from "@/hooks/use-engine";
import { AssistPanel } from "@/components/assist/assist-panel";
import { AssistProvider, useAssistPanel } from "@/hooks/use-assist";

const MAIN_ID = "main";

/**
 * The app shell: one sidebar (search, sections, campaign stages, engine status)
 * and the page. On phones the sidebar becomes a sheet behind a top bar.
 * Also mounts what every page shares: engine data, the projects store,
 * tooltips and the ⌘K palette.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <EngineDataProvider>
      <AssistProvider>
        <ProjectsStoreProvider>
          <TooltipProvider delay={300}>
            <Frame>{children}</Frame>
          </TooltipProvider>
        </ProjectsStoreProvider>
      </AssistProvider>
    </EngineDataProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { open: askOpen, setOpen: setAskOpen } = useAssistPanel();

  // ⌘K opens the palette, ⌘J the Ask Kalos panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (key === "j") {
        e.preventDefault();
        setAskOpen(!askOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askOpen, setAskOpen]);
  const openAsk = () => {
    setSheetOpen(false);
    setAskOpen(true);
  };

  return (
    <div className="canvas flex h-dvh flex-col overflow-hidden">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-label text-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <MobileTopBar onOpenSheet={() => setSheetOpen(true)} onSearch={() => setPaletteOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <aside aria-label="Sidebar" className="hidden w-64 shrink-0 border-r border-border bg-subtle md:block">
          <Sidebar onSearch={() => setPaletteOpen(true)} onAsk={openAsk} />
        </aside>
        <main id={MAIN_ID} tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none">
          <div className="mx-auto w-full max-w-[1080px] px-5 py-8 md:px-10 md:py-12">{children}
            <ResearchFooter />
          </div>
        </main>
      </div>

      <MobileSheet open={sheetOpen} onOpenChange={setSheetOpen} onSearch={() => { setSheetOpen(false); setPaletteOpen(true); }} onAsk={openAsk} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <AssistPanel />
    </div>
  );
}

function MobileTopBar({ onOpenSheet, onSearch }: { onOpenSheet: () => void; onSearch: () => void }) {
  // A header, so the mobile bar is a banner landmark (axe "region": content outside landmarks).
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-subtle px-2 md:hidden">
      <button type="button" onClick={onOpenSheet} aria-label="Open navigation" className="grid size-9 place-items-center rounded-lg text-fg hover:bg-fill-hover">
        <Menu className="size-5" aria-hidden />
      </button>
      <Link href="/" className="px-1 text-heading text-fg">
        Kalos
      </Link>
      <span className="flex-1" />
      <button type="button" onClick={onSearch} aria-label="Search pages and actions" className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-fill-hover hover:text-fg">
        <Search className="size-5" aria-hidden />
      </button>
      <WorkspaceMenu side="bottom" />
    </header>
  );
}

function MobileSheet({ open, onOpenChange, onSearch, onAsk }: { open: boolean; onOpenChange: (open: boolean) => void; onSearch: () => void; onAsk: () => void }) {
  // Following any link closes the sheet.
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
          className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-xs border-r border-border bg-subtle shadow-popover transition-transform duration-200 data-ending-style:-translate-x-full data-starting-style:-translate-x-full md:hidden"
        >
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <Sidebar onSearch={onSearch} onAsk={onAsk} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
