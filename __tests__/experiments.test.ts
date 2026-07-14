import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API } from "@/lib/api";
import {
  ExperimentApiError,
  createExperiment,
  getExperiment,
  listExperiments,
  patchStatus,
  runExperiment,
  runReady,
} from "@/lib/experiments";

/** Minimal Response stand-in - only the members lib/experiments.ts reads. */
function fakeResponse(ok: boolean, status: number, body: unknown): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("lib/experiments.ts", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listExperiments GETs /api/experiments and returns the parsed list", async () => {
    const rows = [{ id: "exp_1", name: "Media screen", status: "READY", updated_at: "2026-07-14T00:00:00Z" }];
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, rows));

    const result = await listExperiments();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/experiments`);
    expect(result).toEqual(rows);
    expect(result[0].status).toBe("READY");
  });

  it("createExperiment POSTs multipart form data with file, name, target, outcomes, anonymize", async () => {
    const created = {
      id: "exp_2",
      name: "Feed test",
      status: "DRAFT",
      created_at: "t",
      updated_at: "t",
      config: { target: "titer", anonymize: true },
      payload: { columns: [], rows: [] },
      result: null,
      provenance: null,
      error: null,
    };
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 201, created));

    const file = new File(["a,b\n1,2"], "sheet.csv", { type: "text/csv" });
    const result = await createExperiment(file, { name: "Feed test", target: "titer", outcomes: "purity,yield", anonymize: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/experiments`);
    expect(init.method).toBe("POST");
    const fd = init.body as FormData;
    expect(fd.get("file")).toBe(file);
    expect(fd.get("name")).toBe("Feed test");
    expect(fd.get("target")).toBe("titer");
    expect(fd.get("outcomes")).toBe("purity,yield");
    expect(fd.get("anonymize")).toBe("true");
    expect(result.status).toBe("DRAFT");
  });

  it("createExperiment omits optional fields when not provided", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(true, 201, {
        id: "exp_3",
        name: "n",
        status: "DRAFT",
        created_at: "t",
        updated_at: "t",
        config: { target: "titer", anonymize: false },
        payload: { columns: [], rows: [] },
        result: null,
        provenance: null,
        error: null,
      }),
    );
    const file = new File(["x"], "sheet.csv");
    await createExperiment(file, { name: "n", target: "titer" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const fd = init.body as FormData;
    expect(fd.get("outcomes")).toBeNull();
    expect(fd.get("anonymize")).toBeNull();
  });

  it("getExperiment GETs /api/experiments/{id}", async () => {
    const exp = {
      id: "exp_4",
      name: "n",
      status: "DONE",
      created_at: "t",
      updated_at: "t",
      config: { target: "titer", anonymize: false },
      payload: { columns: [], rows: [] },
      result: null,
      provenance: null,
      error: null,
    };
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, exp));

    const result = await getExperiment("exp_4");

    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/experiments/exp_4`);
    expect(result.status).toBe("DONE");
  });

  it("patchStatus PATCHes a JSON {status} body to /api/experiments/{id}", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(true, 200, {
        id: "exp_5",
        name: "n",
        status: "READY",
        created_at: "t",
        updated_at: "t",
        config: { target: "titer", anonymize: false },
        payload: { columns: [], rows: [] },
        result: null,
        provenance: null,
        error: null,
      }),
    );

    const result = await patchStatus("exp_5", "READY");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/experiments/exp_5`);
    expect(init.method).toBe("PATCH");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ status: "READY" });
    expect(result.status).toBe("READY");
  });

  it("patchStatus throws ExperimentApiError with the portal's message on a 409", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, { error: "cannot flag a PROCESSING experiment as READY" }));

    const err = await patchStatus("exp_6", "READY").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExperimentApiError);
    expect(err).toMatchObject({
      message: "cannot flag a PROCESSING experiment as READY",
      status: 409,
    });
  });

  it("runExperiment POSTs to /run without a query string by default", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(true, 200, {
        id: "exp_7",
        name: "n",
        status: "DONE",
        created_at: "t",
        updated_at: "t",
        config: { target: "titer", anonymize: false },
        payload: { columns: [], rows: [] },
        result: null,
        provenance: null,
        error: null,
      }),
    );

    await runExperiment("exp_7");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/experiments/exp_7/run`);
    expect(init.method).toBe("POST");
  });

  it("runExperiment appends ?force=true when force is requested", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(true, 200, {
        id: "exp_8",
        name: "n",
        status: "DONE",
        created_at: "t",
        updated_at: "t",
        config: { target: "titer", anonymize: false },
        payload: { columns: [], rows: [] },
        result: null,
        provenance: null,
        error: null,
      }),
    );

    await runExperiment("exp_8", true);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/experiments/exp_8/run?force=true`);
  });

  it("runExperiment resolves (not throws) a FAILED result - a legitimate terminal state, not an HTTP error", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(true, 200, {
        id: "exp_9",
        name: "n",
        status: "FAILED",
        created_at: "t",
        updated_at: "t",
        config: { target: "titer", anonymize: false },
        payload: { columns: [], rows: [] },
        result: null,
        provenance: null,
        error: "zero-variance target column",
      }),
    );

    const result = await runExperiment("exp_9");
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("zero-variance target column");
  });

  it("runReady POSTs to /run-ready and returns the per-experiment summary", async () => {
    const summary = [
      { id: "exp_10", name: "n1", status: "DONE" },
      { id: "exp_11", name: "n2", status: "FAILED", error: "boom" },
    ];
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, summary));

    const result = await runReady();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/experiments/run-ready`);
    expect(init.method).toBe("POST");
    expect(result).toEqual(summary);
  });

  it("throws a status-based message when the error body isn't the documented shape", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, { detail: "internal error" }));

    await expect(listExperiments()).rejects.toMatchObject({
      message: "experiments service responded 500",
      status: 500,
    });
  });

  it("throws a status-based message when the error body isn't valid JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(listExperiments()).rejects.toMatchObject({
      message: "experiments service responded 502",
      status: 502,
    });
  });
});
