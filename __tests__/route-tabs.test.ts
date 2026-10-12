import { describe, expect, it } from "vitest";
import { closeRoute, INITIAL_ROUTE_TABS, MAX_TABS, parseRouteTabs, visitRoute, type RouteTabs } from "@/lib/route-tabs";

const visitAll = (paths: string[], s: RouteTabs = INITIAL_ROUTE_TABS) => paths.reduce(visitRoute, s);

describe("route tabs", () => {
  it("starts with the pinned Overview", () => {
    expect(INITIAL_ROUTE_TABS.open).toEqual(["/"]);
  });

  it("opens a new route to the right of the active tab, and focuses an open one", () => {
    let s = visitAll(["/campaign/plan", "/data"]);
    expect(s.open).toEqual(["/", "/campaign/plan", "/data"]);
    s = visitAll(["/campaign/plan", "/library"], s);
    expect(s.open).toEqual(["/", "/campaign/plan", "/library", "/data"]);
    expect(s.recent[0]).toBe("/library");
  });

  it("caps the strip by dropping the least recently used tab, never the pinned or active one", () => {
    const paths = Array.from({ length: MAX_TABS + 3 }, (_, i) => `/p${i}`);
    const s = visitAll(paths);
    expect(s.open).toHaveLength(MAX_TABS);
    expect(s.open[0]).toBe("/");
    expect(s.open).toContain(paths.at(-1));
    expect(s.open).not.toContain("/p0");
  });

  it("closing the active tab moves to its right neighbor, else its left one", () => {
    const s = visitAll(["/a", "/b", "/c"]);
    expect(closeRoute(s, "/b", "/b")).toEqual({ tabs: { open: ["/", "/a", "/c"], recent: ["/c", "/a", "/"] }, navigateTo: "/c" });
    expect(closeRoute(s, "/c", "/c").navigateTo).toBe("/b");
    expect(closeRoute(visitAll(["/a"]), "/a", "/a").navigateTo).toBe("/");
  });

  it("closing a background tab does not navigate, and the Overview cannot close", () => {
    const s = visitAll(["/a", "/b"]);
    expect(closeRoute(s, "/a", "/b").navigateTo).toBeNull();
    expect(closeRoute(s, "/", "/").tabs).toBe(s);
  });

  it("reads stored state defensively", () => {
    expect(parseRouteTabs(null)).toEqual(INITIAL_ROUTE_TABS);
    expect(parseRouteTabs("{not json")).toEqual(INITIAL_ROUTE_TABS);
    expect(parseRouteTabs(JSON.stringify({ open: ["javascript:alert(1)"], recent: [] }))).toEqual(INITIAL_ROUTE_TABS);
    expect(parseRouteTabs(JSON.stringify({ open: ["/data"], recent: ["/data"] }))).toEqual({ open: ["/", "/data"], recent: ["/data"] });
  });
});
