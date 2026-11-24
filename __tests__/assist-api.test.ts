// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { API } from "@/lib/api";
import {
  assistActionHref,
  campaignDataKey,
  getAssistNext,
  getAssistStatus,
  getTrackRecord,
  getTrackRuns,
  isRouteMissing,
  searchCampaign,
} from "@/lib/assist";
import { EngineError } from "@/lib/engine-error";
import { useAssistStatus, useTrackRecord } from "@/hooks/use-assist";

// The campaign context the hooks key on; null = outside a campaign provider.
const ctx = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/hooks/use-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-engine")>()),
  useOptionalCampaignData: () => ctx.value,
}));

const CMP = "cmp_0123456789abcdef0123456789abcdef";
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const fail = (status: number, body: unknown) => ({ ok: false, status, json: async () => body, headers: new Headers() }) as unknown as Response;

describe("assist and track-record client (lib/assist.ts)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => ok({}));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("GETs the engine paths with the documented query", async () => {
    await getTrackRecord(CMP);
    await getTrackRuns(CMP);
    await searchCampaign(CMP, "high pH runs", 50);
    await getAssistNext(CMP);
    await getAssistNext();
    await getAssistStatus();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      `${API}/api/campaigns/${CMP}/track-record?coverage=0.9&limit=100`,
      `${API}/api/campaigns/${CMP}/track-record/runs?coverage=0.9&limit=500`,
      `${API}/api/campaigns/${CMP}/search?q=high+pH+runs&k=25`,
      `${API}/api/assist/next?campaign_id=${CMP}`,
      `${API}/api/assist/next`,
      `${API}/api/assist/index/status`,
    ]);
    // Reads carry no body and no method override.
    expect(fetchMock.mock.calls.every((c) => c[1] === undefined)).toBe(true);
  });

  it("failures are EngineErrors; only a non-campaign 404 means the route is missing", async () => {
    fetchMock.mockResolvedValueOnce(fail(404, { detail: "Not Found" }));
    const missing = await getTrackRecord(CMP).catch((e: unknown) => e);
    expect(missing).toBeInstanceOf(EngineError);
    expect(isRouteMissing(missing)).toBe(true);
    fetchMock.mockResolvedValueOnce(fail(404, { error: "no_such_engine_route", message: "no such engine route" }));
    expect(isRouteMissing(await getTrackRecord(CMP).catch((e: unknown) => e))).toBe(true);
    fetchMock.mockResolvedValueOnce(fail(404, { error: "campaign not found", code: "not_found" }));
    expect(isRouteMissing(await getTrackRecord(CMP).catch((e: unknown) => e))).toBe(false);
    fetchMock.mockResolvedValueOnce(fail(503, { error: "engine_busy" }));
    expect(isRouteMissing(await getTrackRecord(CMP).catch((e: unknown) => e))).toBe(false);
  });

  it("maps the guide's legacy routes onto this app's pages, and nothing else", () => {
    expect(assistActionHref(CMP, "/campaign/setup")).toBe(`/campaigns/${CMP}/harmonize`);
    expect(assistActionHref(CMP, "/campaign/plan")).toBe(`/campaigns/${CMP}/predict`);
    expect(assistActionHref(CMP, "/campaign/record")).toBe(`/campaigns/${CMP}/validate#record`);
    expect(assistActionHref(CMP, "/campaign/learn")).toBe(`/campaigns/${CMP}/validate#learn`);
    expect(assistActionHref(CMP, "https://evil.example/campaign/plan")).toBeNull();
    expect(assistActionHref(CMP, null)).toBeNull();
  });

  it("campaignDataKey changes when a result is recorded or an analysis lands, and is null until both are known", () => {
    const run = { id: "r1", recipe: {}, pred: 1, std: 0.1, mode: "exploit" as const, reason: "", result: null, awaiting: true };
    const summary = { has_campaign: true as const, target: "t", features: [], n_base: 3, best: 1, round: 1, history: [], pending: [run], n_awaiting: 1, n_measured: 0 };
    const latest = { has_data: false as const };
    const k1 = campaignDataKey(summary, latest);
    expect(campaignDataKey(null, latest)).toBeNull();
    expect(campaignDataKey(summary, null)).toBeNull();
    const k2 = campaignDataKey({ ...summary, pending: [{ ...run, result: 2, awaiting: false, result_version: 1 }] }, latest);
    expect(k2).not.toBe(k1);
    expect(campaignDataKey(summary, latest)).toBe(k1);
  });
});

describe("assist hooks (hooks/use-assist.ts)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    ctx.value = null;
  });

  it("refetches the track record when the campaign's data changes, not on every render", async () => {
    const fetchMock = vi.fn(async () => ok({ campaign_id: CMP, rounds: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const run = { id: "r1", recipe: {}, pred: 1, std: 0.1, mode: "exploit" as const, reason: "", result: null as number | null, awaiting: true };
    const summary = (r: typeof run) => ({ has_campaign: true, round: 1, pending: [r] });
    const provider = (r: typeof run) => ({ campaignId: CMP, campaign: { data: summary(r) }, latest: { data: { has_data: false } } });
    ctx.value = provider(run);
    const { result, rerender } = renderHook(() => useTrackRecord(CMP));
    await waitFor(() => expect(result.current.status).toBe("data"));
    rerender();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    ctx.value = provider({ ...run, result: 2, awaiting: false });
    rerender();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // Another campaign's provider never drives this campaign's reads.
    ctx.value = { ...provider({ ...run, result: 3, awaiting: false }), campaignId: "cmp_other" };
    rerender();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("useTrackRecord loads the record outside a campaign provider", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ campaign_id: CMP, rounds: [] })));
    const { result } = renderHook(() => useTrackRecord(CMP));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("data"));
    expect(result.current.data?.campaign_id).toBe(CMP);
    expect(result.current.unsupported).toBe(false);
  });

  it("an older engine without the route reads as unsupported, not as data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(404, { detail: "Not Found" })));
    const { result } = renderHook(() => useAssistStatus());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.unsupported).toBe(true);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.unsupported).toBe(true);
  });
});
