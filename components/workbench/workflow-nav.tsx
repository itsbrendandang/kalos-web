import Link from "next/link";
import { CAMPAIGN_STAGES, LIBRARY_ITEMS, type RouteItem } from "@/lib/routes";
import { cn } from "@/lib/utils";

const SETTINGS: RouteItem[] = [
  { href: "/settings", label: "Preferences", description: "Appearance and engine connection" },
  { href: "/settings/organization", label: "Organization", description: "Members and invitations" },
  { href: "/settings/security", label: "Security", description: "Two-factor authentication" },
];

/** Nearby tasks stay visible without hiding the scientific page behind editor chrome. */
export function WorkflowNav({ pathname }: { pathname: string }) {
  let items: readonly RouteItem[];
  let label: string;
  if (pathname.startsWith("/campaign/")) {
    items = CAMPAIGN_STAGES;
    label = "Experiment workflow";
  } else if (pathname.startsWith("/library/")) {
    items = [{ href: "/library", label: "All tools", description: "Browse bioprocess tools" }, ...LIBRARY_ITEMS];
    label = "Bioprocess tools";
  } else if (pathname.startsWith("/settings")) {
    items = SETTINGS;
    label = "Workspace settings";
  } else return null;

  return (
    <nav aria-label={label} className="mb-7 min-w-0 overflow-x-auto border-b border-border pb-3 [scrollbar-width:thin]">
      <ul className="flex w-max min-w-full items-center gap-1">
        {items.map((item, index) => (
          <li key={item.href}>
            <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={cn("inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-caption", pathname === item.href ? "bg-brand font-medium text-brand-fg" : "text-fg-muted hover:bg-subtle hover:text-fg")}>
              {label === "Experiment workflow" ? <span className="text-[10px] tabular-nums">{index + 1}</span> : null}{item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
