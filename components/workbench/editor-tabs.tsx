"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { Pin, X } from "lucide-react";
import { createStorageStore } from "@/lib/storage-store";
import { closeRoute, INITIAL_ROUTE_TABS, parseRouteTabs, PINNED_TAB, visitRoute } from "@/lib/route-tabs";
import { cn } from "@/lib/utils";

const tabsStore = createStorageStore("session", "kalos.tabs", parseRouteTabs, INITIAL_ROUTE_TABS);

/**
 * The editor tab strip. Every tab is a route: visiting a route focuses or
 * opens its tab, closing the active tab navigates to its neighbour, and the
 * Overview is pinned. Arrow keys move between tabs (and open them), Delete
 * closes the focused one. The strip scrolls sideways inside itself.
 */
export function EditorTabs({ titleFor, panelId }: { titleFor: (href: string) => string; panelId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = tabsStore.useValue();
  const refs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    tabsStore.set(visitRoute(tabsStore.get(), pathname));
  }, [pathname]);

  // Until the effect above runs (first paint), the active route still gets a tab.
  const open = tabs.open.includes(pathname) ? tabs.open : [...tabs.open, pathname];

  const close = (href: string) => {
    const { tabs: next, navigateTo } = closeRoute(tabsStore.get(), href, pathname);
    tabsStore.set(next);
    if (navigateTo) router.push(navigateTo);
  };

  const onKeyDown = (e: KeyboardEvent, at: number) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (open[at] === PINNED_TAB) return;
      e.preventDefault();
      const neighbour = open[at + 1] ?? open[at - 1];
      close(open[at]);
      if (neighbour) requestAnimationFrame(() => refs.current.get(neighbour)?.focus());
      return;
    }
    const target = e.key === "ArrowRight" ? open[(at + 1) % open.length] : e.key === "ArrowLeft" ? open[(at - 1 + open.length) % open.length] : null;
    if (!target) return;
    e.preventDefault();
    refs.current.get(target)?.focus();
    router.push(target);
  };

  return (
    <div role="tablist" aria-label="Open pages" className="flex h-9 shrink-0 overflow-x-auto overflow-y-hidden border-b border-border bg-subtle [scrollbar-width:none]">
      {open.map((href, i) => {
        const active = href === pathname;
        const pinned = href === PINNED_TAB;
        const title = titleFor(href);
        return (
          <div
            key={href}
            className={cn(
              "group relative flex shrink-0 items-center border-r border-border",
              active ? "-mb-px border-b border-b-bg bg-bg text-fg" : "text-fg-muted hover:text-fg",
            )}
            onAuxClick={(e) => {
              if (e.button === 1 && !pinned) close(href);
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={active ? panelId : undefined}
              tabIndex={active ? 0 : -1}
              ref={(el) => {
                if (el) refs.current.set(href, el);
                else refs.current.delete(href);
              }}
              onClick={() => router.push(href)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn("flex h-full items-center gap-1.5 pl-3 text-label whitespace-nowrap focus-visible:outline-offset-[-2px]", pinned ? "pr-3" : "pr-1", active ? "font-medium" : "font-normal")}
            >
              {pinned ? <Pin className="size-3.5 text-fg-muted" aria-hidden /> : null}
              {title}
              {pinned ? <span className="sr-only"> (pinned)</span> : null}
            </button>
            {pinned ? null : (
              <button
                type="button"
                aria-label={`Close ${title}`}
                tabIndex={-1}
                onClick={() => close(href)}
                className={cn(
                  "mr-1.5 grid size-5 place-items-center rounded text-fg-muted hover:bg-border hover:text-fg",
                  active ? "visible" : "invisible group-hover:visible group-focus-within:visible",
                )}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
