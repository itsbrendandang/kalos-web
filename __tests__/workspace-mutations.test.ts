import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API } from "@/lib/api";
import {
  REANALYZE_MAX_ATTEMPTS,
  approveWorkspaceBatch,
  closeWorkspaceLoop,
  logWorkspaceRunResult,
  toStartRecipes,
  uploadWorkspaceDataset,
} from "@/lib/workspace/adapter";
import { bookedProposalIds } from "@/lib/workspace/proposal-logic";
import type { Proposal, Run } from "@/lib/workspace/types";

/** Minimal Response stand-in - only the members lib/api.ts reads. */
function fakeResponse(ok: boolean, status: number, body: unknown): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

/** A response whose body is not JSON at all (an empty 409, an HTML error page
 *  from a proxy in front of the engine). `r.json()` rejects, which is the one
 *  branch of lib/api.ts's `engineError()` that `fakeResponse` above can never
 *  reach - see the malformed-body test in `closeWorkspaceLoop`. */
function unparseableResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  } as unknown as Response;
}

/** The engine's own 409 wording, copied from kalos/portal/campaign.py's
 *  `commit_fold`, so these tests fail if the UI ever starts paraphrasing it. */
const CONFLICT = "the campaign changed during re-analysis (a new write landed); nothing was committed";

function run(id: string, recipe: Record<string, number>, over: Partial<Run> = {}): Run {
  return {
    id,
    recipe,
    status: "proposed",
    mode: "exploit",
    predicted: 7.3,
    predictedBand: 0.4,
    measuredValue: null,
    reason: "glucose up",
    ...over,
  };
}

function proposal(id: string, rank: number, recipe: Record<string, number>, over: Partial<Run> = {}): Proposal {
  const r = run(id, recipe, over);
  return { id, rank, run: r, summary: r.reason };
}

describe("toStartRecipes", () => {
  it("sends the proposal's own recipe, prediction, band, mode and reason", () => {
    const p = proposal("proposal-1", 1, { glucose_gL: 7.2, feed_start_day: 2 }, { mode: "explore" });

    expect(toStartRecipes([p])).toEqual([
      {
        recipe: { glucose_gL: 7.2, feed_start_day: 2 },
        pred: 7.3,
        std: 0.4,
        mode: "explore",
        reason: "glucose up",
      },
    ]);
  });

  it("books a prediction-less proposal as prediction-less, never as zero", () => {
    const p = proposal("proposal-1", 1, { pH: 6.5 }, { predicted: null, predictedBand: null, reason: null });

    expect(toStartRecipes([p])[0]).toMatchObject({ pred: null, std: null, reason: null });
  });
});

describe("bookedProposalIds", () => {
  it("matches a proposal to a started run by its recipe, regardless of key order", () => {
    const proposals = [
      proposal("proposal-1", 1, { glucose_gL: 7.2, feed_start_day: 2 }),
      proposal("proposal-2", 2, { glucose_gL: 6.8, feed_start_day: 2 }),
    ];
    const booked = [run("r-201", { feed_start_day: 2, glucose_gL: 7.2 })];

    expect([...bookedProposalIds(proposals, booked)]).toEqual(["proposal-1"]);
  });

  it("does not call a near-miss recipe booked", () => {
    const proposals = [proposal("proposal-1", 1, { glucose_gL: 7.2, feed_start_day: 2 })];
    const booked = [run("r-201", { glucose_gL: 7.21, feed_start_day: 2 })];

    expect(bookedProposalIds(proposals, booked).size).toBe(0);
  });

  it("is empty when nothing has been booked", () => {
    expect(bookedProposalIds([proposal("proposal-1", 1, { pH: 6 })], []).size).toBe(0);
  });
});

describe("approveWorkspaceBatch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the batch to /api/campaign/start and reports ok", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, { started: [] }));

    const result = await approveWorkspaceBatch([proposal("proposal-1", 1, { glucose_gL: 7.2 })]);

    expect(result).toEqual({ status: "ok" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/campaign/start`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string).recipes).toHaveLength(1);
  });

  it("surfaces the engine's own rejection reason, not a generic failure", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(false, 400, { error: "each recipe must include a non-empty 'recipe' mapping of feature -> value" }),
    );

    const result = await approveWorkspaceBatch([proposal("proposal-1", 1, {})]);

    expect(result).toEqual({
      status: "error",
      reason: "each recipe must include a non-empty 'recipe' mapping of feature -> value",
    });
  });

  it("says the engine was unreachable when the request never got an answer", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await approveWorkspaceBatch([proposal("proposal-1", 1, { pH: 6 })]);

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.reason).toMatch(/could not be reached/);
  });

  it("refuses an empty batch without touching the engine", async () => {
    const result = await approveWorkspaceBatch([]);

    expect(result.status).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("logWorkspaceRunResult", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs {id, value} and reports ok", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, { id: "r-201", result: 7.9 }));

    const result = await logWorkspaceRunResult("r-201", 7.9);

    expect(result).toEqual({ status: "ok" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/campaign/result`);
    expect(JSON.parse(init.body as string)).toEqual({ id: "r-201", value: 7.9 });
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("refuses %s locally, using the engine's own rule and wording", async (_label, value) => {
    const result = await logWorkspaceRunResult("r-201", value);

    expect(result).toEqual({ status: "error", reason: `result value must be a finite number; got ${value}` });
    // The point of validating locally is that a value the engine would reject
    // never reaches it and never looks accepted for a moment.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs a legitimate zero rather than treating it as missing", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, {}));

    expect(await logWorkspaceRunResult("r-201", 0)).toEqual({ status: "ok" });
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string).value).toBe(0);
  });

  it("surfaces the engine's rejection verbatim", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 400, { error: "unknown pending run id 'r-999'" }));

    expect(await logWorkspaceRunResult("r-999", 7.9)).toEqual({
      status: "error",
      reason: "unknown pending run id 'r-999'",
    });
  });
});

describe("closeWorkspaceLoop", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs to /api/campaign/reanalyze once when the engine commits", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, { analysis: {}, campaign: {} }));

    expect(await closeWorkspaceLoop()).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(`${API}/api/campaign/reanalyze`);
  });

  it("retries a 409 - the engine committed nothing and expects the caller to send it again", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(false, 409, { error: CONFLICT }))
      .mockResolvedValueOnce(fakeResponse(true, 200, { analysis: {}, campaign: {} }));

    expect(await closeWorkspaceLoop()).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rides out repeated 409s up to the attempt cap", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(false, 409, { error: CONFLICT }))
      .mockResolvedValueOnce(fakeResponse(false, 409, { error: CONFLICT }))
      .mockResolvedValueOnce(fakeResponse(true, 200, { analysis: {}, campaign: {} }));

    expect(await closeWorkspaceLoop()).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(REANALYZE_MAX_ATTEMPTS);
  });

  it("reports a conflict that survives every attempt instead of a closed loop", async () => {
    for (let i = 0; i < REANALYZE_MAX_ATTEMPTS; i++) {
      fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, { error: CONFLICT }));
    }

    const result = await closeWorkspaceLoop();

    expect(fetchMock).toHaveBeenCalledTimes(REANALYZE_MAX_ATTEMPTS);
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    // The engine's own sentence survives, with the retry history added.
    expect(result.reason).toContain(CONFLICT);
    expect(result.reason).toContain(`Retried ${REANALYZE_MAX_ATTEMPTS} times`);
  });

  // The retry decision keys off the STATUS, not the message, precisely so a
  // 409 the engine could not author a reason for still retries. These two
  // tests are the only thing standing between that and a future refactor that
  // sniffs `error.message` for "changed during re-analysis" - which would
  // silently stop retrying whenever a proxy swallows the body.
  it("retries a 409 whose body is not parseable JSON", async () => {
    fetchMock
      .mockResolvedValueOnce(unparseableResponse(409))
      .mockResolvedValueOnce(fakeResponse(true, 200, { analysis: {}, campaign: {} }));

    expect(await closeWorkspaceLoop()).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the status when a surviving 409 carries no readable reason", async () => {
    for (let i = 0; i < REANALYZE_MAX_ATTEMPTS; i++) {
      fetchMock.mockResolvedValueOnce(unparseableResponse(409));
    }

    const result = await closeWorkspaceLoop();

    expect(fetchMock).toHaveBeenCalledTimes(REANALYZE_MAX_ATTEMPTS);
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    // No invented sentence, and no "undefined": the status the engine really
    // returned, plus the retry history.
    expect(result.reason).toContain("engine responded 409");
    expect(result.reason).toContain(`Retried ${REANALYZE_MAX_ATTEMPTS} times`);
  });

  it("does NOT retry a 400 - nothing to fold in will not fix itself", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(false, 400, { error: "no measured runs to fold; log at least one result first" }),
    );

    const result = await closeWorkspaceLoop();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "error",
      reason: "no measured runs to fold; log at least one result first",
    });
  });

  it("does not retry an unreachable engine either", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await closeWorkspaceLoop();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("error");
  });
});

describe("uploadWorkspaceDataset", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const file = new File(["glucose_gL,titer\n6,4.1\n"], "runsheet.csv", { type: "text/csv" });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the file to /api/run and reports ok", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, { has_data: true, n: 2 }));

    expect(await uploadWorkspaceDataset(file)).toEqual({ status: "ok" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/run`);
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBe(file);
    expect((init.body as FormData).get("target")).toBeNull();
  });

  it("sends a target only when one was actually given", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, { has_data: true }));

    await uploadWorkspaceDataset(file, "  titer  ");

    expect(((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData).get("target")).toBe("titer");
  });

  it("passes the engine's refusal through word for word", async () => {
    const refusal = "cannot replace this campaign's data: it holds 2 measured results";
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 400, { error: refusal }));

    expect(await uploadWorkspaceDataset(file)).toEqual({ status: "error", reason: refusal });
  });

  it("does not report success for an engine that never answered", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await uploadWorkspaceDataset(file);

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.reason).toMatch(/could not be reached/);
  });
});
