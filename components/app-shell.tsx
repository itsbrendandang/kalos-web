"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ClipboardList,
  Database,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Sparkles,
  SquareKanban,
  TestTubes,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV: { href: string; label: string; short: string; helper: string; icon: LucideIcon }[] = [
  { href: "/", label: "Operations", short: "Ops", helper: "Live experiments", icon: Activity },
  { href: "/results", label: "Results", short: "Results", helper: "Model + analysis", icon: LayoutDashboard },
  { href: "/analyze", label: "Run analysis", short: "Analyze", helper: "Upload run sheet", icon: FlaskConical },
  { href: "/experiments", label: "Experiments", short: "Experiments", helper: "Portal run queue", icon: ListChecks },
  { href: "/planning", label: "Planning", short: "Plan", helper: "Kanban board", icon: SquareKanban },
  { href: "/optimize", label: "Optimize", short: "Optimize", helper: "Next experiments", icon: Sparkles },
  { href: "/plate", label: "Plate analysis", short: "Plate", helper: "96-well QC", icon: LayoutGrid },
  { href: "/vessels", label: "Vessels", short: "Vessels", helper: "ambr kinetics", icon: TestTubes },
  { href: "/voyager", label: "Projects", short: "Projects", helper: "Customer runs", icon: FolderKanban },
  { href: "/data", label: "Data room", short: "Data", helper: "Registry", icon: Database },
];

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
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => {
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
        </nav>

        <div className="mt-auto rounded-2xl border border-border bg-blue-soft p-3">
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
          <nav className="grid grid-cols-8 gap-1">
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
