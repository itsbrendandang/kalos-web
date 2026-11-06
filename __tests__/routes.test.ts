import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { breadcrumbFor, EXPERIMENTS_ROUTE, NAV_ITEMS, navKeyFor, RAIL_GROUPS, type NavKey } from "@/lib/routes";

const root = join(__dirname, "..");

const labels = (keys: readonly NavKey[]) => keys.map((k) => NAV_ITEMS.find((n) => n.key === k)!.label);

describe("sidebar groups", () => {
  it("is Overview, then Tools, then Workspace, with Settings at the foot", () => {
    expect(NAV_ITEMS.map((n) => n.key)).toEqual(["campaign", "agent", "review", "process", "graph", "data", "library", "projects", "settings"]);
    expect(RAIL_GROUPS.map((g) => g.label)).toEqual([null, "Tools", "Workspace"]);
    expect(labels(RAIL_GROUPS[0].keys)).toEqual(["Overview"]);
    expect(labels(RAIL_GROUPS[1].keys)).toEqual(["Agent", "Review", "Process", "Graph"]);
    expect(labels(RAIL_GROUPS[2].keys)).toEqual(["Data", "Library", "Projects"]);
  });

  it("has no collapsed group and no 'More'", () => {
    expect(RAIL_GROUPS.some((g) => g.label === "More")).toBe(false);
  });

  it("names the first section Overview, at /, and never Campaign", () => {
    expect(NAV_ITEMS[0]).toMatchObject({ key: "campaign", href: "/", label: "Overview" });
    expect(NAV_ITEMS.some((n) => (n.label as string) === "Campaign")).toBe(false);
  });

  it("does not list Experiments as a rail entry: it is a sub-view of Overview", () => {
    expect(NAV_ITEMS.some((n) => n.href === EXPERIMENTS_ROUTE.href)).toBe(false);
    expect(navKeyFor(EXPERIMENTS_ROUTE.href)).toBe("campaign");
    expect(breadcrumbFor(EXPERIMENTS_ROUTE.href).map((b) => b.label)).toEqual(["Overview", "Experiments"]);
  });

  it("maps every campaign stage page to the Overview section", () => {
    for (const p of ["/campaign/setup", "/campaign/plan", "/campaign/run", "/campaign/record", "/campaign/learn"]) {
      expect(navKeyFor(p)).toBe("campaign");
    }
  });

  it("covers every section key exactly once across the rail", () => {
    const keys: NavKey[] = [...RAIL_GROUPS.flatMap((g) => g.keys), "settings"];
    expect([...keys].sort()).toEqual(NAV_ITEMS.map((n) => n.key).sort());
  });
});

describe("README route lines match the code", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");

  it("does not say /experiments redirects to /", () => {
    expect(readme).not.toMatch(/`\/experiments`[^|\n]*\|\s*`\/`/);
  });

  it("describes the sidebar as Overview with its stages, Tools and Workspace, never a More group", () => {
    expect(readme).toMatch(/Sidebar\.\*\* Overview[^\n]*five stages[^\n]*Tools \(Agent, Review, Process, Graph\)[^\n]*Workspace \(Data, Library, Projects\)/);
    expect(readme).not.toMatch(/Activity rail/);
    expect(readme).not.toMatch(/\bMore \(Review/);
  });

  it("has no redirect for /experiments in next.config.ts", () => {
    const cfg = readFileSync(join(root, "next.config.ts"), "utf8");
    expect(cfg).not.toMatch(/source: "\/experiments"/);
  });
});
