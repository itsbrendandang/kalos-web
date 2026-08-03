"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Atom,
  Database,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Sparkles,
  TestTubes,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  helper: string;
  icon: LucideIcon;
};

const WORKFLOW: NavItem[] = [
  { href: "/", label: "Experiments", helper: "Plan and track", icon: ListChecks },
  { href: "/analyze", label: "Analyze run sheet", mobileLabel: "Analyze", helper: "Fit and validate", icon: Upload },
  { href: "/decide", label: "Decide next batch", mobileLabel: "Decide", helper: "Rank recommendations", icon: Sparkles },
  { href: "/results", label: "Model evidence", mobileLabel: "Evidence", helper: "Reliability and drivers", icon: LayoutDashboard },
];

const TOOLS: NavItem[] = [
  { href: "/vessels", label: "Vessels", helper: "Run kinetics", icon: TestTubes },
  { href: "/plate", label: "Plate analysis", helper: "96-well quality", icon: FlaskConical },
  { href: "/simulate", label: "Simulator", helper: "Synthetic benchmark", icon: Atom },
  { href: "/data", label: "Data room", helper: "Datasets and lineage", icon: Database },
];

const CLIENTS: NavItem[] = [
  { href: "/voyager", label: "Client projects", helper: "Shared program view", icon: FolderKanban },
];

const MOBILE_NAV = [WORKFLOW[0], WORKFLOW[1], WORKFLOW[2], WORKFLOW[3], TOOLS[3]];

function Leaf({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21c0-5 0-7-3-10S4 7 4 7s4 1 6 3 2 5 2 5z" fill="currentColor" opacity="0.55" />
      <path d="M12 21c0-4 1-6 3.5-8.5S20 9 20 9s-1 4-3.5 6.5S12 21 12 21z" fill="currentColor" />
    </svg>
  );
}

function NavGroup({ label, items, path }: { label: string; items: NavItem[]; path: string }) {
  return (
    <div className="space-y-1">
      <div className="px-3 pb-1 text-[10px] font-bold tracking-[0.14em] text-[#789083] uppercase">{label}</div>
      {items.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 transition-[background-color,border-color,color,transform] duration-150",
              active
                ? "border-[#2da87d] bg-[#19865f] text-white shadow-[0_8px_20px_rgba(0,0,0,0.16)]"
                : "border-transparent text-[#c2d0c8] hover:translate-x-0.5 hover:border-white/10 hover:bg-white/[0.06] hover:text-white",
            )}
          >
            <item.icon className="size-[17px] shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{item.label}</span>
              <span className={cn("block truncate text-[11px]", active ? "text-white/75" : "text-[#82988c]")}>{item.helper}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "";
  const isVoyager = path.startsWith("/voyager");

  return (
    <div className="min-h-svh bg-bg md:flex">
      <aside className="hidden w-[248px] shrink-0 flex-col bg-sidebar px-3 py-4 md:sticky md:top-0 md:flex md:h-svh">
        <div className="mb-6 flex items-center gap-3 px-2 py-1 text-white">
          <span className="grid size-10 place-items-center rounded-xl bg-accent text-white shadow-[0_7px_18px_rgba(0,0,0,0.2)]">
            <Leaf />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-head text-[18px] leading-none font-bold tracking-[-0.02em]">Bioqore</div>
            <div className="mt-1 text-[10px] font-semibold tracking-[0.08em] text-[#8da197] uppercase">Experiment intelligence</div>
          </div>
          <ThemeToggle className="size-10 border-white/10 text-[#b7c8bf] hover:border-white/20 hover:bg-white/10 hover:text-white" />
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-3" aria-label="Primary navigation">
          <NavGroup label="Experiment loop" items={WORKFLOW} path={path} />
          <NavGroup label="Lab and models" items={TOOLS} path={path} />
          <div className="border-t border-white/10 pt-4">
            <NavGroup label="External" items={CLIENTS} path={path} />
          </div>
        </nav>

        <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3 text-[#a9bcb1]">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-white">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#5bd3a5] opacity-40" />
              <span className="relative inline-flex size-2 rounded-full bg-[#5bd3a5]" />
            </span>
            Local workspace
          </div>
          <div className="mt-2 flex items-center gap-2 font-mono text-[10px]">
            <Activity className="size-3.5" />
            Engine endpoint :8050
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-card/95 px-4 backdrop-blur-md md:hidden">
          <span className="grid size-9 place-items-center rounded-xl bg-sidebar text-white"><Leaf size={19} /></span>
          <div className="ml-3">
            <div className="font-head text-[17px] leading-none font-bold tracking-[-0.02em]">Bioqore</div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-accent-text">
              <span className="size-1.5 rounded-full bg-accent" /> Local workspace
            </div>
          </div>
          <ThemeToggle className="ml-auto" />
        </header>

        <main className="min-w-0 pb-24 md:pb-0">
          {isVoyager ? children : <div className="mx-auto w-full max-w-[1240px] px-4 py-7 sm:px-6 md:px-8 md:py-10 lg:px-10">{children}</div>}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden"
          aria-label="Workflow navigation"
        >
          {MOBILE_NAV.map((item) => {
            const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition-colors",
                  active ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-blue-soft hover:text-fg",
                )}
              >
                <item.icon className="size-[18px]" />
                <span className="w-full truncate text-center">{item.mobileLabel ?? item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
