import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API, getCampaignDetail, proposalRecipe, submitReanalyzeJob, recordCampaignResult, startCampaignRuns, type Campaign, type Proposal } from "@/lib/api";
import { EngineError } from "@/lib/engine-error";

// The campaign loop through the multi-campaign routes the pages use (the
// legacy default-campaign client functions were removed with their callers).
const CMP = "cmp_0123456789abcdef0123456789abcdef";
const getCampaign = () => getCampaignDetail(CMP).then((d) => d.summary);
const startRuns = (recipes: Parameters<typeof startCampaignRuns>[1]) => startCampaignRuns(CMP, recipes);
const logResult = (id: string, value: number) => recordCampaignResult(CMP, id, value);
const reanalyze = () => submitReanalyzeJob(CMP);
const detail = (summary: unknown) => ({ campaign: { id: CMP }, summary });

/** Minimal Response stand-in - only the members lib/api.ts reads. */
function fakeResponse(ok: boolean, status: number, body: unknown): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("campaign client (lib/api.ts)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getCampaignDetail GETs /api/campaigns/{id} and the summary is the parsed body", async () => {
    const campaign: Campaign = {
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
      pending: [],
      n_awaiting: 0,
      n_measured: 0,
    };
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, detail(campaign)));

    const result = await getCampaign();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/campaigns/${CMP}`);
    expect(result).toEqual(campaign);
    if (result.has_campaign) {
      expect(result.history).toEqual(campaign.history);
    }
  });

  it("a campaign with no upload yet has a {has_campaign:false} summary", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, detail({ has_campaign: false })));

    const result = await getCampaign();

    expect(result).toEqual({ has_campaign: false });
  });

  it("a non-ok response throws a typed error, never a fake empty campaign", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, {}));

    await expect(getCampaign()).rejects.toMatchObject({ status: 500, code: "engine_error" });
  });

  it("startCampaignRuns POSTs {recipes} as JSON to /api/campaigns/{id}/runs", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, { started: [] }));
    const recipes = [{ recipe: { pH: 6.5, Methanol: 2.0 }, pred: 4.6, std: 0.3, mode: "explore", reason: "diversifies the batch" }];

    await startRuns(recipes);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/campaigns/${CMP}/runs`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", "x-kalos-csrf": "1" });
    expect(JSON.parse(init.body as string)).toEqual({ recipes });
  });

  it("startCampaignRuns throws a typed error carrying the engine's sentence", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 400, { error: "bad recipe", code: "invalid_request" }));

    await expect(startRuns([])).rejects.toMatchObject({ status: 400, code: "invalid_request", detail: "bad recipe" });
  });

  it("recordCampaignResult POSTs {value} as JSON to /api/campaigns/{id}/runs/{run}/result", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(true, 200, { id: "b1e2", recipe: { pH: 6.5 }, pred: 4.6, std: 0.3, mode: "explore", reason: "r", result: 3.2, awaiting: false }),
    );

    await logResult("b1e2", 3.2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/campaigns/${CMP}/runs/b1e2/result`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", "x-kalos-csrf": "1" });
    expect(JSON.parse(init.body as string)).toEqual({ value: 3.2 });
  });

  it("recordCampaignResult carries the documented {error, code} on a 400", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 400, { error: "result must be finite", code: "invalid_result" }));

    await expect(logResult("nope", 1)).rejects.toMatchObject({ code: "invalid_result", detail: "result must be finite" });
  });

  it("falls back to a status-based code when the error body isn't the documented shape", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, { detail: "internal error" }));

    await expect(logResult("b1e2", 1)).rejects.toMatchObject({ status: 500, code: "engine_error" });
  });

  it("falls back to a status-based code when the error body isn't valid JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    const err = await logResult("b1e2", 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect(err).toMatchObject({ status: 502, code: "engine_error" });
  });

  it("submitReanalyzeJob POSTs to /api/campaigns/{id}/reanalyze/jobs and returns the queued job", async () => {
    const job = { id: "job_0123456789abcdef0123456789abcdef", campaign_id: CMP, kind: "reanalyze", state: "queued", stage: "queued", progress: 0 };
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 202, { job }));

    const result = await reanalyze();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/campaigns/${CMP}/reanalyze/jobs`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "x-kalos-csrf": "1" });
    expect(result).toEqual(job);
  });

  it("submitReanalyzeJob surfaces job_pending (409) as a typed error", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, { error: "a job is already queued or running for this campaign", code: "job_pending" }));
    await expect(reanalyze()).rejects.toMatchObject({ status: 409, code: "job_pending" });
  });

  it("submitReanalyzeJob throws a typed error on a busy engine", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 503, {}));

    await expect(reanalyze()).rejects.toMatchObject({ status: 503, code: "engine_busy" });
  });
});

// Regression guard: Start used to record only the proposal_features columns,
// so a started run lost every other setpoint - the campaign then reported those
// inputs as "missing" after re-analysis, and the in-flight block zero-filled
// them (marking the wrong region as already being run).
describe("proposalRecipe", () => {
  const base: Proposal = { vals: [7.1, 36.5], pred: 1.2, std: 0.1, mode: "exploit", reason: "" };

  it("returns every setpoint the engine sent, not just the proposal_features", () => {
    const recipe = { pH: 7.1, temperature_C: 36.5, glucose_gL: 3.1, DO_pct: 30 };
    expect(proposalRecipe({ ...base, recipe }, ["pH", "temperature_C"])).toEqual(recipe);
  });

  it("falls back to the proposal_features for older engines without a recipe", () => {
    expect(proposalRecipe(base, ["pH", "temperature_C"])).toEqual({ pH: 7.1, temperature_C: 36.5 });
  });
});
