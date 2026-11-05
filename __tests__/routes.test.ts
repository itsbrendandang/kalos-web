import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { breadcrumbFor, EXPERIMENTS_ROUTE, NAV_ITEMS, navKeyFor, RAIL_MORE, RAIL_TOP, type NavKey } from "@/lib/routes";

const root = join(__dirname, "..");

describe("activity rail", () => {
  it("is Overview, Agent, More, then Settings, in that order", () => {
    expect(NAV_ITEMS.map((n) => n.key)).toEqual(["campaign", "agent", "review", "process", "graph", "data", "library", "projects", "settings"]);
    expect(RAIL_TOP.map((k) => NAV_ITEMS.find((n) => n.key === k)!.label)).toEqual(["Overview", "Agent"]);
    expect(RAIL_MORE.map((k) => NAV_ITEMS.find((n) => n.key === k)!.label)).toEqual(["Review", "Process", "Graph", "Data", "Library", "Projects"]);
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
    const keys: NavKey[] = [...RAIL_TOP, ...RAIL_MORE, "settings"];
    expect([...keys].sort()).toEqual(NAV_ITEMS.map((n) => n.key).sort());
  });
});

describe("README route lines match the code", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");

  it("does not say /experiments redirects to /", () => {
    expect(readme).not.toMatch(/`\/experiments`[^|\n]*\|\s*`\/`/);
  });

  it("describes the rail with Overview, Agent and More, not Campaign/Data/Library/Projects", () => {
    expect(readme).toMatch(/Activity rail\.\*\* Overview[^\n]*Agent[^\n]*More/);
    expect(readme).not.toMatch(/Activity rail\.\*\* Campaign, Data/);
  });

  it("has no redirect for /experiments in next.config.ts", () => {
    const cfg = readFileSync(join(root, "next.config.ts"), "utf8");
    expect(cfg).not.toMatch(/source: "\/experiments"/);
  });
});
