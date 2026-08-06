import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API, getCampaign, logResult, reanalyze, startRuns, type Campaign } from "@/lib/api";

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

  it("startRuns throws the engine's own {error} reason on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 400, { error: "bad recipe" }));

    await expect(startRuns([])).rejects.toThrow("bad recipe");
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

  it("logResult throws with the documented {error} message on a 400", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 400, { error: "unknown id" }));

    await expect(logResult("nope", 1)).rejects.toThrow("unknown id");
  });

  it("logResult falls back to a status-based message when the error body isn't the documented shape", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, { detail: "internal error" }));

    await expect(logResult("b1e2", 1)).rejects.toThrow("engine responded 500");
  });

  it("logResult falls back to a status-based message when the error body isn't valid JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(logResult("b1e2", 1)).rejects.toThrow("engine responded 502");
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

  it("reanalyze throws a status-based message on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, {}));

    await expect(reanalyze()).rejects.toThrow("engine responded 500");
  });
});
