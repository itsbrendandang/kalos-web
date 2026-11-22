import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API, getCampaign, logResult, MAX_RESULT_REASON, proposalRecipe, reanalyze, startRuns, type Campaign, type Proposal } from "@/lib/api";
import { EngineError } from "@/lib/engine-error";

/** A real Response, so engineError can read the status, headers and body. `ok` must agree with the status. */
function fakeResponse(ok: boolean, status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const r = new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  expect(r.ok).toBe(ok);
  return r;
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

  it("getCampaign GETs /api/campaign and returns the parsed body", async () => {
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
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, campaign));

    const result = await getCampaign();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/campaign`);
    expect(result).toEqual(campaign);
    if (result.has_campaign) {
      expect(result.history).toEqual(campaign.history);
    }
  });

  it("getCampaign returns {has_campaign:false} before any upload", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, { has_campaign: false }));

    const result = await getCampaign();

    expect(result).toEqual({ has_campaign: false });
  });

  it("getCampaign throws a status-based message on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, {}));

    await expect(getCampaign()).rejects.toThrow("engine responded 500");
  });

  it("startRuns POSTs {recipes} as JSON to /api/campaign/start", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, { started: [] }));
    const recipes = [{ recipe: { pH: 6.5, Methanol: 2.0 }, pred: 4.6, std: 0.3, mode: "explore", reason: "diversifies the batch" }];

    await startRuns(recipes);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/campaign/start`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ recipes });
  });

  it("startRuns throws an EngineError carrying the engine's status, code and message", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 400, { error: "bad recipe", code: "invalid_request" }));

    const e = await startRuns([]).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EngineError);
    expect(e).toMatchObject({ status: 400, code: "invalid_request", kind: "rejected", message: "bad recipe" });
  });

  it("startRuns reports an archived campaign as a conflict and a busy engine with its Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, { error: "the campaign is archived" }));
    await expect(startRuns([])).rejects.toMatchObject({ kind: "conflict", status: 409 });
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 503, { error: "busy" }, { "retry-after": "5" }));
    await expect(startRuns([])).rejects.toMatchObject({ kind: "busy", retryAfter: 5 });
  });

  it("logResult POSTs {id, value} as JSON to /api/campaign/result", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(true, 200, { id: "b1e2", recipe: { pH: 6.5 }, pred: 4.6, std: 0.3, mode: "explore", reason: "r", result: 3.2, awaiting: false }),
    );

    await logResult("b1e2", 3.2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/campaign/result`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ id: "b1e2", value: 3.2 });
  });

  it("logResult sends a correction reason, trimmed, only when one is given", async () => {
    fetchMock.mockImplementation(async () => fakeResponse(true, 200, {}));
    const sent = (i: number) => JSON.parse((fetchMock.mock.calls[i][1] as RequestInit).body as string);

    await logResult("b1e2", 3.4, "  transcription error ");
    await logResult("b1e2", 3.4, "   ");
    await logResult("b1e2", 3.4, undefined);

    expect(sent(0)).toEqual({ id: "b1e2", value: 3.4, reason: "transcription error" });
    expect(sent(1)).toEqual({ id: "b1e2", value: 3.4 });
    expect(sent(2)).toEqual({ id: "b1e2", value: 3.4 });
    expect(MAX_RESULT_REASON).toBe(256);
  });

  it("logResult throws an EngineError with code reason_required for a correction without a reason", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(false, 400, { error: "a correction to a recorded result needs a reason: say why the value changed", code: "reason_required" }),
    );

    const e = await logResult("b1e2", 4.2).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EngineError);
    expect(e).toMatchObject({ status: 400, code: "reason_required", kind: "rejected" });
  });

  it("logResult throws with the documented {error} message on a 400", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 400, { error: "unknown id" }));

    await expect(logResult("nope", 1)).rejects.toThrow("unknown id");
  });

  it("logResult reads FastAPI's {detail} and falls back to a status-based message without a message", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, { detail: "internal error" }));
    await expect(logResult("b1e2", 1)).rejects.toMatchObject({ kind: "server", message: "internal error" });

    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, {}));
    await expect(logResult("b1e2", 1)).rejects.toThrow("engine responded 500");
  });

  it("logResult falls back to a status-based message when the error body isn't valid JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad Gateway</html>", { status: 502 }));

    const e = await logResult("b1e2", 1).catch((x: unknown) => x);
    expect(e).toMatchObject({ kind: "unreachable", message: "engine responded 502" });
  });

  it("reanalyze POSTs to /api/campaign/reanalyze and returns {analysis, campaign}", async () => {
    const analysis = { has_data: true, n: 41, target: "lipase_titer" };
    const campaign: Campaign = {
      has_campaign: true,
      target: "lipase_titer",
      features: ["pH"],
      n_base: 41,
      best: 6.1,
      round: 3,
      history: [
        { round: 0, best: 4.6, n_base: 39 },
        { round: 1, best: 5.2, n_base: 40 },
        { round: 2, best: 5.9, n_base: 40 },
        { round: 3, best: 6.1, n_base: 41 },
      ],
      pending: [],
      n_awaiting: 0,
      n_measured: 0,
    };
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, { analysis, campaign }));

    const result = await reanalyze();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/campaign/reanalyze`);
    expect(init.method).toBe("POST");
    expect(result).toEqual({ analysis, campaign });
  });

  it("reanalyze throws an EngineError on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, {}));
    await expect(reanalyze()).rejects.toThrow("engine responded 500");

    fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, { error: "the campaign changed during the analysis", code: "campaign_changed" }));
    await expect(reanalyze()).rejects.toMatchObject({ kind: "conflict", code: "campaign_changed" });

    fetchMock.mockResolvedValueOnce(fakeResponse(false, 502, { error: "Kalos engine did not respond in time" }));
    await expect(reanalyze()).rejects.toBeInstanceOf(EngineError);
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
