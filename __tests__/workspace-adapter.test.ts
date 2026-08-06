import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API, type Campaign as EngineCampaign } from "@/lib/api";
import {
  getNewestCampaignId,
  getWorkspaceCampaign,
  listWorkspaceCampaigns,
  monogram,
} from "@/lib/workspace/adapter";

/** Minimal Response stand-in - only the members lib/api.ts reads. */
function fakeResponse(ok: boolean, status: number, body: unknown): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

const NO_CAMPAIGN: EngineCampaign = { has_campaign: false };

const ACTIVE_CAMPAIGN: EngineCampaign = {
  has_campaign: true,
  target: "lipase_titer",
  features: ["pH", "Methanol"],
  n_base: 40,
  best: 5.9,
  round: 2,
  history: [
    { round: 0, best: 4.6, n_base: 36 },
    { round: 1, best: 5.2, n_base: 38 },
    { round: 2, best: 5.9, n_base: 40 },
  ],
  pending: [
    { id: "r1", recipe: { pH: 6.5 }, pred: 6.1, std: 0.3, mode: "exploit", reason: "push pH up", result: null, awaiting: true },
    { id: "r2", recipe: { pH: 6.0 }, pred: 5.8, std: 0.2, mode: "explore", reason: "diversify", result: 5.9, awaiting: false },
  ],
  n_awaiting: 1,
  n_measured: 1,
};

describe("monogram", () => {
  it("takes the first two characters of the first word, uppercased", () => {
    expect(monogram("CHO titer uplift")).toBe("CH");
    expect(monogram("HEK yield screen")).toBe("HE");
    expect(monogram("Fc-fusion pilot")).toBe("FC");
    expect(monogram("lipase_titer")).toBe("LI");
    expect(monogram("  spaced   name  ")).toBe("SP");
    expect(monogram("")).toBe("--");
  });
});

describe("workspace adapter (lib/workspace/adapter.ts)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.NEXT_PUBLIC_DEMO_MODE = originalDemoMode;
  });

  it("listWorkspaceCampaigns returns the one live campaign, not demo, when the engine has one", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, ACTIVE_CAMPAIGN));

    const result = await listWorkspaceCampaigns();

    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/campaign`);
    expect(result).toEqual({
      status: "ok",
      demo: false,
      campaigns: [{ id: "current", name: "lipase_titer", monogram: "LI", statusLine: "Round 2 · 1 awaiting" }],
    });
  });

  it("listWorkspaceCampaigns returns an empty (not fabricated) list when there is no live campaign and demo mode is off", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, NO_CAMPAIGN));

    const result = await listWorkspaceCampaigns();

    expect(result).toEqual({ status: "ok", demo: false, campaigns: [] });
  });

  it("listWorkspaceCampaigns reports unavailable (not empty) on a fetch failure", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, {}));

    const result = await listWorkspaceCampaigns();

    expect(result).toEqual({ status: "unavailable" });
  });

  it("getWorkspaceCampaign maps engine pending runs to proposed/measured, never failed (not modeled by the engine)", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, ACTIVE_CAMPAIGN));

    const result = await getWorkspaceCampaign("current");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.demo).toBe(false);
    expect(result.campaign.currentRound).toBe(2);
    const openRound = result.campaign.rounds.find((r) => r.number === 2);
    expect(openRound?.status).toBe("open");
    expect(openRound?.runs.map((r) => r.status)).toEqual(["proposed", "measured"]);
    expect(result.campaign.rounds.find((r) => r.number === 0)?.status).toBe("closed");
    // Closed rounds have no per-round run breakdown from the engine - an
    // honest empty array, not a fabricated one.
    expect(result.campaign.rounds.find((r) => r.number === 0)?.runs).toEqual([]);
  });

  it("getWorkspaceCampaign is not-found for a real id the engine doesn't recognize, with demo mode off", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, NO_CAMPAIGN));

    const result = await getWorkspaceCampaign("current");

    expect(result).toEqual({ status: "not-found" });
  });

  it("getWorkspaceCampaign never returns a mock campaign with demo mode off (the default test env)", async () => {
    // lib/demo.ts's DEMO_MODE is read once at module-eval time from
    // NEXT_PUBLIC_DEMO_MODE, which is unset in this test run - so a mock-only
    // id (one that exists in lib/workspace/mock.ts but not the live engine)
    // must resolve to "not-found", never to fabricated demo data.
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, NO_CAMPAIGN));

    const result = await getWorkspaceCampaign("cho-titer-uplift");

    expect(result).toEqual({ status: "not-found" });
  });

  it("getNewestCampaignId returns the live campaign's id when one exists", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, ACTIVE_CAMPAIGN));

    const result = await getNewestCampaignId();

    expect(result).toEqual({ status: "ok", id: "current" });
  });

  it("getNewestCampaignId returns a null id (not a crash) when there are no campaigns", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, NO_CAMPAIGN));

    const result = await getNewestCampaignId();

    expect(result).toEqual({ status: "ok", id: null });
  });
});
