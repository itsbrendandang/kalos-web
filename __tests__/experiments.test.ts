import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API } from "@/lib/api";
import { ExperimentApiError, listExperiments } from "@/lib/experiments";


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


  it("throws ExperimentApiError with the portal's documented { error } message", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 503, { error: "experiments store unavailable" }));

    const err = await listExperiments().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExperimentApiError);
    expect(err).toMatchObject({
      message: "experiments store unavailable",
      status: 503,
    });
  });

  it("throws a status-based message when the error body isn't the documented shape", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, { detail: "internal error" }));

    await expect(listExperiments()).rejects.toMatchObject({
      message: "experiments service responded 500",
      status: 500,
    });
  });

  it("returns an empty list on 404 - an engine without a run store has no live runs, not a dead connection", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 404, { detail: "Not Found" }));

    await expect(listExperiments()).resolves.toEqual([]);
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
