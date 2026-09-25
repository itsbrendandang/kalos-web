"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Atom,
  ClipboardList,
  Compass,
  Database,
  LayoutDashboard,
  Ruler,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type NavItem = { href: string; label: string; short: string; helper: string; icon: LucideIcon };

// Grouped by what the engine actually does, so the nav reads as a workflow
// rather than a flat wall of links. The Scale-up readout is the home route
// ("/" redirects to it): it answers the scale-up question from the user's own
// multi-scale data and refuses when that data cannot support a prediction.
// "Optimize" is the campaign loop (propose -> run -> log outcome ->
// re-propose, kalos/docs/CAMPAIGN_LOOP.md) plus the analysis it rests on; Run
// analysis is an action button on Decide and Results, not a nav entry. The
// desktop sidebar renders the section labels; the compact mobile bar flattens
// them.
const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Scale-up",
    items: [
      { href: "/scale-readout", label: "Scale-up readout", short: "Scale-up", helper: "Data-backed at a new scale", icon: Ruler },
    ],
  },
  {
    label: "Optimize",
    items: [
      { href: "/decide", label: "Decide", short: "Decide", helper: "Next batch to run", icon: Compass },
      { href: "/validate", label: "Validate", short: "Validate", helper: "Pre-flight data checks", icon: ShieldCheck },
      { href: "/results", label: "Results", short: "Results", helper: "Model · drivers · next experiments", icon: LayoutDashboard },
      { href: "/simulate", label: "In-silico optimizer", short: "Simulate", helper: "Synthetic BO benchmark", icon: Atom },
    ],
  },
  {
    label: "Data",
    items: [{ href: "/data", label: "Data room", short: "Data", helper: "Registry", icon: Database }],
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
            <div key={section.label} className="flex flex-col gap-1">
              <div className="px-3 pb-0.5 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
                {section.label}
              </div>
              {section.items.map((n) => {
                const active = path.startsWith(n.href);
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
          <nav className="grid grid-cols-3 gap-1">
            {NAV.map((n) => {
              const active = path.startsWith(n.href);
              return (
                // The compact mobile bar only has room for an icon and a 3-4
                // character short label - the per-item helper subtitle the
                // desktop rail shows underneath each link has nowhere to go
                // here, so it surfaces as a tooltip instead of being dropped.
                <Tooltip key={n.href}>
                  <TooltipTrigger
                    render={
                      <Link
                        href={n.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] px-0.5 text-center text-[9.5px] leading-none font-semibold outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                          active ? "bg-accent text-[color:var(--primary-foreground)]" : "text-muted hover:bg-blue-soft hover:text-fg",
                        )}
                      />
                    }
                  >
                    <n.icon className="size-4 shrink-0" />
                    <span className="w-full truncate">{n.short}</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <span className="font-semibold">{n.label}</span>
                    <span className="text-background/70"> · {n.helper}</span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
        </div>
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}
