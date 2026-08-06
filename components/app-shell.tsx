"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Atom, FolderKanban, ListChecks, Workflow, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = { href: string; label: string; short: string; helper: string; icon: LucideIcon };

/**
 * The whole destination list, flat.
 *
 * It used to be five labelled groups (Monitor / Analyze / Data / Clients,
 * plus the workspace pinned above them as a filled primary tile) covering
 * eight destinations. That structure existed to give the old lifecycle IA -
 * watch the lab, analyze results, the data behind it - a shape, and it ran
 * alongside the campaign workspace as a second, competing IA.
 *
 * The lifecycle routes are gone (see app/page.tsx), so there are no stages
 * left to group by, and grouping is not free: a section label is a claim that
 * the items under it belong together and apart from the others. With three
 * destinations there is nothing to disambiguate - the labels would each head
 * a list of one, which is louder than the thing it organises. So this is one
 * flat list, in the order the product reads: the campaign workspace first
 * (the surface everything else orbits and where `/` lands), then the two
 * genuine peers.
 *
 * The workspace also loses its filled primary treatment for the same reason
 * the groups went. That treatment marked it as the one live destination among
 * legacy routes; now it is simply the first of three peers, and giving it a
 * different shape from the others would re-introduce a hierarchy the IA no
 * longer has. It reads as home by position, not by decoration.
 *
 * The desktop sidebar and the compact mobile bar render the same list.
 */
const NAV: NavItem[] = [
  { href: "/c", label: "Campaign workspace", short: "Campaign", helper: "Log · Map · Brief", icon: Workflow },
  { href: "/experiments", label: "Experiments", short: "Exp", helper: "Run sheets · analyses", icon: ListChecks },
  { href: "/simulate", label: "In-silico benchmark", short: "Benchmark", helper: "Synthetic BO surface", icon: Atom },
  { href: "/voyager", label: "Client portal", short: "Clients", helper: "Voyager", icon: FolderKanban },
];

/** Prefix match, but on whole path segments, so `/c` never lights up for a
 *  hypothetical `/campaigns`. The workspace entry can in practice never be
 *  active - AppShell returns early for `/c/*` and the workspace renders its
 *  own rail instead - but the rule is written once for all four rather than
 *  special-cased, so adding a destination later cannot get it wrong. */
function isActive(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

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
  // The campaign workspace (/c/[campaignId], feat/campaign-workspace-redesign)
  // brings its own full-bleed shell - a campaign rail that replaces this
  // sidebar as primary navigation, a 56px workspace header, and an Ask
  // panel - see components/workspace/workspace-shell.tsx. Rendering it
  // inside this shared sidebar/mobile-bar chrome would nest one nav inside
  // another, so it's skipped entirely for this route family, the same way
  // Voyager already opts out of the content max-width wrapper above.
  if (path === "/c" || path.startsWith("/c/")) return <>{children}</>;
  return (
    <div className="flex min-h-svh bg-bg">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card px-3 py-5 max-md:hidden">
        <div className="mb-7 flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-accent">
            <Leaf />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-head text-[17px] font-bold text-fg">Kalos</div>
            <div className="truncate text-[11px] text-muted">Process optimizer</div>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] transition-colors",
                  active
                    ? "border border-blue-border bg-accent-soft font-semibold text-accent-text"
                    : "border border-transparent text-muted hover:border-border hover:bg-blue-soft hover:text-fg",
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
      </aside>

      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="mb-3 flex items-center gap-2">
            <Leaf size={20} />
            <span className="font-head font-bold">Kalos</span>
            <ThemeToggle className="ml-auto" />
          </div>
          {/* One column per destination - the grid was a fixed 6 columns to
              hold eight flattened items, which no longer matches the list. */}
          <nav className="grid grid-cols-4 gap-1">
            {NAV.map((n) => {
              const active = isActive(path, n.href);
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
