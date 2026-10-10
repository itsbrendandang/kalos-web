import { describe, expect, it } from "vitest";
import type { CampaignRun, LatestResult } from "@/lib/api";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import {
  campaignView,
  closeTab,
  inFlight,
  INITIAL_TABS,
  measured,
  openTab,
  pruneRunTabs,
  queueState,
  shortId,
  tabKey,
  type ActiveCampaign,
  type TabsState,
} from "@/lib/workbench";

const run = (id: string, result: number | null): CampaignRun => ({
  id,
  recipe: { pH: 7 },
  pred: 5,
  std: 0.3,
  mode: "exploit",
  reason: "r",
  result,
  awaiting: result == null,
});

const real: ActiveCampaign = {
  ...DEMO_CAMPAIGN,
  target: "real_target",
  pending: [run("aaaaaaaa1", null), run("bbbbbbbb2", 4.2), run("cccccccc3", null)],
  n_awaiting: 2,
  n_measured: 1,
};

/**
 * The honesty rules the old Live board carried, kept for the workbench: a
 * rejected fetch is "error" - never "none" (an empty campaign is a claim
 * about the lab) and never demo data standing in for a failed request.
 */
describe("campaignView", () => {
  it("is 'error' on a rejected fetch, even with stale data and demo mode on", () => {
    expect(campaignView(real, true, true, DEMO_CAMPAIGN)).toEqual({ state: "error" });
    expect(campaignView(null, true, true, DEMO_CAMPAIGN)).toEqual({ state: "error" });
  });

  it("is 'loading' before the fetch settles", () => {
    expect(campaignView(null, false, false, DEMO_CAMPAIGN)).toEqual({ state: "loading" });
  });

  it("shows a real campaign as real, even in demo mode", () => {
    expect(campaignView(real, false, true, DEMO_CAMPAIGN)).toEqual({ state: "data", campaign: real, demo: false });
  });

  it("is 'none' for a confirmed-absent campaign with demo mode off", () => {
    expect(campaignView({ has_campaign: false }, false, false, DEMO_CAMPAIGN)).toEqual({ state: "none" });
  });

  it("uses demo data only for a confirmed-absent campaign with demo mode on, flagged as demo", () => {
    expect(campaignView({ has_campaign: false }, false, true, DEMO_CAMPAIGN)).toEqual({
      state: "data",
      campaign: DEMO_CAMPAIGN,
      demo: true,
    });
  });
});

describe("queueState", () => {
  const sample = { has_data: false } as LatestResult;

  it("is 'error' on a rejected fetch, even with stale data", () => {
    expect(queueState(null, true)).toBe("error");
    expect(queueState(sample, true)).toBe("error");
  });

  it("is 'loading' before the fetch settles and 'data' only after a confirmed one", () => {
    expect(queueState(null, false)).toBe("loading");
    expect(queueState(sample, false)).toBe("data");
  });
});

describe("explorer helpers", () => {
  it("splits pending runs into in flight (awaiting) and measured, keeping order", () => {
    expect(inFlight(real).map((r) => r.id)).toEqual(["aaaaaaaa1", "cccccccc3"]);
    expect(measured(real).map((r) => r.id)).toEqual(["bbbbbbbb2"]);
  });

  it("shortens opaque run ids to a stable prefix", () => {
    expect(shortId("d3f1a9c2e7")).toBe("d3f1a9c");
    expect(shortId("abc")).toBe("abc");
  });

  it("the demo fixture's counts agree with its pending runs", () => {
    expect(inFlight(DEMO_CAMPAIGN)).toHaveLength(DEMO_CAMPAIGN.n_awaiting);
    expect(measured(DEMO_CAMPAIGN)).toHaveLength(DEMO_CAMPAIGN.n_measured);
  });
});

describe("editor tabs", () => {
  const keys = (s: TabsState) => s.open.map(tabKey);

  it("starts with Next batch and Progress open, Next batch focused", () => {
    expect(keys(INITIAL_TABS)).toEqual(["batch", "progress"]);
    expect(INITIAL_TABS.active).toBe("batch");
  });

  it("opens a new tab to the right of the active one and focuses it", () => {
    const s = openTab(INITIAL_TABS, { kind: "run", runId: "x" });
    expect(keys(s)).toEqual(["batch", "run:x", "progress"]);
    expect(s.active).toBe("run:x");
  });

  it("focuses an already-open tab instead of opening a duplicate", () => {
    const s = openTab(openTab(INITIAL_TABS, { kind: "run", runId: "x" }), { kind: "batch" });
    const again = openTab(s, { kind: "run", runId: "x" });
    expect(keys(again)).toEqual(["batch", "run:x", "progress"]);
    expect(again.active).toBe("run:x");
  });

  it("closing the active tab focuses its right neighbor, else its left one, else nothing", () => {
    const three = openTab(INITIAL_TABS, { kind: "run", runId: "x" }); // batch, run:x*, progress
    expect(closeTab(three, "run:x").active).toBe("progress");
    const last = { ...three, active: "progress" };
    expect(closeTab(last, "progress").active).toBe("run:x");
    const one = closeTab(closeTab(INITIAL_TABS, "progress"), "batch");
    expect(one).toEqual({ open: [], active: null });
  });

  it("closing an inactive tab keeps the focus where it was", () => {
    const s = closeTab(INITIAL_TABS, "progress");
    expect(keys(s)).toEqual(["batch"]);
    expect(s.active).toBe("batch");
  });

  it("prunes run tabs whose run is gone, leaving the fixed tabs and live runs open", () => {
    let s = openTab(INITIAL_TABS, { kind: "run", runId: "gone" });
    s = openTab(s, { kind: "run", runId: "kept" });
    const pruned = pruneRunTabs(s, new Set(["kept"]));
    expect(keys(pruned)).toEqual(["batch", "run:kept", "progress"]);
    expect(pruned.active).toBe("run:kept");
  });

  it("pruning with nothing stale returns the same state, so React skips a re-render", () => {
    const s = openTab(INITIAL_TABS, { kind: "run", runId: "kept" });
    expect(pruneRunTabs(s, new Set(["kept"]))).toBe(s);
  });
});
