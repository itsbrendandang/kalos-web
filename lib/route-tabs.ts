/*
 * The editor tab strip's state. Every tab is a route (a pathname), so deep
 * links, reload and Back work; this only remembers which routes are open.
 * The Overview ("/") is pinned first and never closes; the active route always
 * has a tab; the strip is capped by dropping the least recently used tab.
 * Pure, tested in __tests__/route-tabs.test.ts.
 */

export const PINNED_TAB = "/";
export const MAX_TABS = 8;

/** `open` in strip order; `recent` most recently visited first. */
export type RouteTabs = { open: string[]; recent: string[] };

export const INITIAL_ROUTE_TABS: RouteTabs = { open: [PINNED_TAB], recent: [PINNED_TAB] };

/** Focus `href`'s tab, or open one to the right of the previously active tab. */
export function visitRoute(s: RouteTabs, href: string): RouteTabs {
  let open = s.open.includes(PINNED_TAB) ? [...s.open] : [PINNED_TAB, ...s.open];
  if (!open.includes(href)) {
    const at = open.indexOf(s.recent[0] ?? PINNED_TAB);
    open.splice(at === -1 ? open.length : at + 1, 0, href);
  }
  const recent = [href, ...s.recent.filter((r) => r !== href && open.includes(r))];
  while (open.length > MAX_TABS) {
    const drop = [...recent].reverse().find((r) => r !== PINNED_TAB && r !== href) ?? open.find((r) => r !== PINNED_TAB && r !== href);
    open = open.filter((r) => r !== drop);
    recent.splice(recent.indexOf(drop!), 1);
  }
  return { open, recent: recent.filter((r) => open.includes(r)) };
}

/**
 * Close `href`. When it is the active route, `navigateTo` is where to go next:
 * its right neighbor, else its left one (the pinned Overview at worst).
 */
export function closeRoute(s: RouteTabs, href: string, active: string): { tabs: RouteTabs; navigateTo: string | null } {
  if (href === PINNED_TAB || !s.open.includes(href)) return { tabs: s, navigateTo: null };
  const at = s.open.indexOf(href);
  const open = s.open.filter((r) => r !== href);
  const tabs = { open, recent: s.recent.filter((r) => r !== href) };
  if (href !== active) return { tabs, navigateTo: null };
  return { tabs, navigateTo: open[at] ?? open[at - 1] ?? PINNED_TAB };
}

/** Read a stored strip back, trusting nothing about its shape. */
export function parseRouteTabs(raw: string | null): RouteTabs {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object" && "open" in v && "recent" in v) {
      const isPaths = (x: unknown): x is string[] => Array.isArray(x) && x.every((p) => typeof p === "string" && p.startsWith("/"));
      if (isPaths(v.open) && isPaths(v.recent)) {
        const open = [...new Set([PINNED_TAB, ...v.open])].slice(0, MAX_TABS);
        return { open, recent: v.recent.filter((r) => open.includes(r)) };
      }
    }
  } catch {
    // Corrupt storage: start fresh.
  }
  return INITIAL_ROUTE_TABS;
}
