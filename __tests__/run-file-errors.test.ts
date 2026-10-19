import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runFile } from "@/lib/api";
import { EngineError } from "@/lib/engine-error";

/** Minimal Response stand-in: a JSON body, or a body that is not JSON (text). */
function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}
function htmlResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  } as unknown as Response;
}

const sheet = () => new File(["a,b\n1,2"], "sheet.csv", { type: "text/csv" });

describe("runFile: every failure is typed (EngineError) except the documented 400", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("the proxy's own JSON codes are carried through on the error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(413, { error: "payload_too_large", limit_mb: 25 }));
    const err = await runFile(sheet()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect(err).toMatchObject({ status: 413, code: "payload_too_large", limitMb: 25 });
  });

  it("429, 401 and 503 keep their codes", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: "rate_limited" }));
    await expect(runFile(sheet())).rejects.toMatchObject({ code: "rate_limited" });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "unauthenticated" }));
    await expect(runFile(sheet())).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: "engine_busy" }));
    await expect(runFile(sheet())).rejects.toMatchObject({ code: "engine_busy", status: 503 });
  });

  it("a non-JSON 502 (a proxy's HTML page) is a typed engine_error, not a parse crash", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(502));
    const err = await runFile(sheet()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect(err).toMatchObject({ status: 502, code: "engine_error" });
  });

  it("a non-JSON 503 and 504 map to busy and timeout", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(503));
    await expect(runFile(sheet())).rejects.toMatchObject({ code: "engine_busy" });
    fetchMock.mockResolvedValueOnce(htmlResponse(504));
    await expect(runFile(sheet())).rejects.toMatchObject({ code: "engine_timeout" });
  });

  it("a network failure is a typed engine_unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(runFile(sheet())).rejects.toMatchObject({ status: 0, code: "engine_unreachable" });
  });

  it("a 2xx that is not JSON is a failure, not an empty result", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(200));
    await expect(runFile(sheet())).rejects.toBeInstanceOf(EngineError);
  });

  it("the documented 400 bad-sheet body is still returned inline, with its code and sheets", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Sheet 'X' not found", code: "sheet_not_found", sheets: ["A", "B"] }));
    await expect(runFile(sheet(), undefined, undefined, "X")).resolves.toMatchObject({ code: "sheet_not_found", sheets: ["A", "B"] });
  });

  it("a 400 with no error text is a failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { detail: "bad" }));
    await expect(runFile(sheet())).rejects.toMatchObject({ status: 400, code: "engine_error" });
  });
});
