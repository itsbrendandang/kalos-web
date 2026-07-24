"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Atom,
  ClipboardList,
  Database,
  FolderKanban,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  TestTubes,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = { href: string; label: string; short: string; helper: string; icon: LucideIcon };

// The internal scientist workflow is grouped by lifecycle stage (watch the lab
// -> analyze results -> the data behind it) so the nav reads as a workflow,
// not a flat wall of links. Experiments is the single hub for planning,
// running, and tracking runs (Live / Board / Table views live at "/"), so
// Operations/Planning/Optimize are no longer separate destinations, and Run
// analysis is an action button rather than a nav entry. "Clients" is split
// off with a divider: it's the client-facing surface (Bioqore's customers
// viewing their own runs), a different audience from the internal tool, so it
// doesn't belong inside "Analyze". The desktop sidebar renders the section
// labels; the compact mobile bar flattens them.
const NAV_SECTIONS: { label: string; items: NavItem[]; divided?: boolean }[] = [
  {
    label: "Monitor",
    items: [
      { href: "/", label: "Experiments", short: "Exp", helper: "Live · Board · Table", icon: ListChecks },
      { href: "/vessels", label: "Vessels", short: "Vessels", helper: "ambr kinetics", icon: TestTubes },
    ],
  },
  {
    label: "Analyze",
    items: [
      { href: "/results", label: "Results", short: "Results", helper: "Model · drivers · next experiments", icon: LayoutDashboard },
      { href: "/plate", label: "Plate analysis", short: "Plate", helper: "96-well QC", icon: LayoutGrid },
      { href: "/simulate", label: "In-silico optimizer", short: "Simulate", helper: "Synthetic BO benchmark", icon: Atom },
    ],
  },
  {
    label: "Data",
    items: [{ href: "/data", label: "Data room", short: "Data", helper: "Registry", icon: Database }],
  },
  {
    label: "Clients",
    divided: true,
    items: [{ href: "/voyager", label: "Projects", short: "Projects", helper: "Client portal", icon: FolderKanban }],
  },
];

const NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

function Leaf({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21c0-5 0-7-3-10S4 7 4 7s4 1 6 3 2 5 2 5z" fill="var(--primary-foreground)" opacity="0.7" />
      <path d="M12 21c0-4 1-6 3.5-8.5S20 9 20 9s-1 4-3.5 6.5S12 21 12 21z" fill="var(--primary-foreground)" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "";
  // The Voyager product surface (app/voyager/layout.tsx) brings its own inner
  // max-width/padding wrapper (`.voyager-root`), so the shell's content
  // container is skipped there to avoid double padding - the sidebar/top nav
  // chrome below is shared by every route, Voyager included.
  const isVoyager = path.startsWith("/voyager");
  return (
    <div className="flex min-h-svh bg-bg">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card px-3 py-5 max-md:hidden">
        <div className="mb-7 flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-accent">
            <Leaf />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-head text-[17px] font-bold text-fg">Kalos</div>
            <div className="text-[11px] text-muted">Client dashboard</div>
          </div>
          <ThemeToggle />
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div
              key={section.label}
              className={cn("flex flex-col gap-1", section.divided && "mt-1 border-t border-border pt-4")}
            >
              <div className="px-3 pb-0.5 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                {section.label}
              </div>
              {section.items.map((n) => {
                const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] transition-colors",
                      active ? "border border-blue-border bg-accent-soft font-semibold text-accent-text" : "border border-transparent text-muted hover:border-border hover:bg-blue-soft hover:text-fg",
                    )}
                  >
                    <n.icon className="size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block">{n.label}</span>
                      <span className={cn("block text-[11px] font-normal", active ? "text-accent-text" : "text-muted")}>
                        {n.helper}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-4 shrink-0 rounded-2xl border border-border bg-blue-soft p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-fg">
            <ClipboardList className="size-3.5" />
            Typical workflow
          </div>
          <div className="space-y-1.5 text-[11px] text-muted">
            <div>1. Upload run sheet</div>
            <div>2. Review model reliability</div>
            <div>3. Select next experiments</div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="mb-3 flex items-center gap-2">
            <Leaf size={20} />
            <span className="font-head font-bold">Kalos</span>
            <ThemeToggle className="ml-auto" />
          </div>
          <nav className="grid grid-cols-6 gap-1">
            {NAV.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] px-0.5 text-center text-[9.5px] leading-none font-semibold transition-colors",
                    active ? "bg-accent text-[color:var(--primary-foreground)]" : "text-muted hover:bg-blue-soft hover:text-fg",
                  )}
                >
                  <n.icon className="size-4 shrink-0" />
                  <span className="w-full truncate">{n.short}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        {isVoyager ? (
          children
        ) : (
          <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 md:px-8 md:py-8">{children}</div>
        )}
      </main>
    </div>
  );
}
