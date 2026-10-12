/*
 * Every page in the app, in one place: the activity rail, the explorers, the
 * editor tabs and breadcrumb, the command palette and the Library index all
 * read from here, so a route is renamed or added once. Labels are what people see.
 */

export type StageKey = "setup" | "plan" | "run" | "record" | "learn";

export type RouteItem = { href: string; label: string; description: string };

/** The activity rail's sections, in order; Settings is pinned at the rail's foot. */
export const NAV_ITEMS = [
  { key: "campaign", href: "/", label: "Campaign", description: "The live campaign: where the round is and what to do next." },
  { key: "data", href: "/data", label: "Data", description: "Datasets and runs in the registry." },
  { key: "library", href: "/library", label: "Library", description: "Standalone tools: vessels, plates, scale-up, simulator." },
  { key: "projects", href: "/projects", label: "Projects", description: "Client projects (illustrative seed data)." },
  { key: "settings", href: "/settings", label: "Settings", description: "Appearance, engine connection and optional integrations." },
] as const satisfies readonly (RouteItem & { key: string })[];

export type NavKey = (typeof NAV_ITEMS)[number]["key"];

export const OVERVIEW_ROUTE: RouteItem = { href: "/", label: "Overview", description: "Where the campaign is and what to do next." };

/** The campaign stages, in order: Setup once, then Plan, Run, Record, Learn each round. */
export const CAMPAIGN_STAGES = [
  { key: "setup", href: "/campaign/setup", label: "Setup", description: "Upload a run sheet, check data quality and choose the target." },
  { key: "plan", href: "/campaign/plan", label: "Plan", description: "Review and start the proposed batch." },
  { key: "run", href: "/campaign/run", label: "Run", description: "Runs in flight and their recipes." },
  { key: "record", href: "/campaign/record", label: "Record", description: "Enter measured results." },
  { key: "learn", href: "/campaign/learn", label: "Learn", description: "What the round taught the model, then plan the next one." },
] as const satisfies readonly (RouteItem & { key: StageKey })[];

export const LIBRARY_ITEMS: readonly RouteItem[] = [
  { href: "/library/vessels", label: "Vessels", description: "Bioreactor kinetics across vessels." },
  { href: "/library/plate", label: "Plate analysis", description: "96-well plate QC and growth curves." },
  { href: "/library/scale-up", label: "Scale-up readout", description: "Predict a recipe at a larger scale from your data." },
  { href: "/library/simulator", label: "Simulator", description: "A synthetic optimization benchmark to try the method." },
  { href: "/projects", label: "Client projects", description: "Client-facing project workspaces (illustrative seed data)." },
];

const PAGES: readonly RouteItem[] = [...CAMPAIGN_STAGES, ...LIBRARY_ITEMS];

/** Which rail section a pathname belongs to. */
export function navKeyFor(pathname: string): NavKey {
  if (pathname === "/" || pathname.startsWith("/campaign")) return "campaign";
  if (pathname.startsWith("/data")) return "data";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/settings")) return "settings";
  return "campaign";
}

/**
 * Breadcrumb trail for the header: the section, then the page when it is not
 * the section's own index. Unknown sub-pages (a project id) fall back to the
 * section alone; those pages title themselves.
 */
export function breadcrumbFor(pathname: string): RouteItem[] {
  const section = NAV_ITEMS.find((n) => n.key === navKeyFor(pathname))!;
  const page = PAGES.find((p) => p.href === pathname && p.href !== section.href);
  return page ? [section, page] : [section];
}

/**
 * A short tab title for any pathname: the page's label, Overview for "/", the
 * section label for a section index, and otherwise the last path segment.
 */
export function titleFor(pathname: string): string {
  if (pathname === "/") return OVERVIEW_ROUTE.label;
  const known = PAGES.find((p) => p.href === pathname) ?? NAV_ITEMS.find((n) => n.href === pathname);
  if (known) return known.label;
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}
