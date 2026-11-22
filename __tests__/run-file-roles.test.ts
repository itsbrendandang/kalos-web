import { afterEach, describe, expect, it, vi } from "vitest";
import { runFile } from "@/lib/api";
import { EngineError } from "@/lib/engine-error";

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const file = new File(["a,b\n1,2"], "s.csv");

describe("runFile sends explicit column roles", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("appends target and a JSON roles field when given, and omits roles otherwise", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ n: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await runFile(file, "y", { target: "y", features: ["a", "b"] });
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(body.get("target")).toBe("y");
    expect(JSON.parse(body.get("roles") as string)).toEqual({ target: "y", features: ["a", "b"] });

    await runFile(file, "y");
    expect(((fetchMock.mock.calls[1][1] as RequestInit).body as FormData).has("roles")).toBe(false);
  });

  it("sends replace=true only when the caller confirmed the replacement", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ n: 1 }, 200));
    vi.stubGlobal("fetch", fetchMock);
    const sent = (i: number) => (fetchMock.mock.calls[i][1] as RequestInit).body as FormData;

    await runFile(file);
    await runFile(file, undefined, undefined, false);
    await runFile(file, "y", undefined, true);
    expect(sent(0).has("replace")).toBe(false);
    expect(sent(1).has("replace")).toBe(false);
    expect(sent(2).get("replace")).toBe("true");
  });
});

describe("runFile: a bad sheet is a result, everything else throws", () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (r: Response) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));

  it.each([
    ["parse_error", 400],
    ["fit_failed", 400],
    ["corrupt_excel", 400],
    ["sheet_not_found", 400],
    ["no_usable_sheet", 400],
    ["validation_error", 422],
  ])("returns a %s (%i) inline with the engine's sentence", async (code, status) => {
    answer(json({ error: "The sheet has a problem.", code, sheets: ["A"] }, status));
    const d = await runFile(file);
    expect(d.error).toBe("The sheet has a problem.");
    expect((d as { code?: string }).code).toBe(code);
  });

  it("returns an older engine's code-less { error } on a 400 inline", async () => {
    answer(json({ error: "Need at least 6 rows." }, 400));
    expect((await runFile(file)).error).toBe("Need at least 6 rows.");
  });

  it("throws an EngineError for a 409 campaign_has_runs, never a sheet problem", async () => {
    answer(json({ error: "the campaign has 3 awaiting and 2 measured run(s)", code: "campaign_has_runs" }, 409));
    const e = await runFile(file).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EngineError);
    expect(e).toMatchObject({ status: 409, kind: "conflict", code: "campaign_has_runs" });
  });

  it.each([
    [502, { error: "Kalos engine did not respond in time" }, "unreachable"],
    [504, {}, "unreachable"],
    [503, { error: "an analysis is already running", code: "busy" }, "busy"],
    [401, { error: "Kalos engine requires authentication" }, "auth"],
    [403, { detail: "missing scope" }, "auth"],
    [413, { error: "too big", code: "payload_too_large" }, "rejected"],
    [500, { error: "internal" }, "server"],
  ])("throws on %i with kind %s even when the body carries { error }", async (status, body, kind) => {
    answer(json(body, status, status === 503 ? { "retry-after": "7" } : {}));
    const e = await runFile(file).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EngineError);
    expect((e as EngineError).kind).toBe(kind);
    expect((e as EngineError).status).toBe(status);
    if (status === 503) expect((e as EngineError).retryAfter).toBe(7);
  });

  it("throws on a 400 or 422 without the { error } shape (FastAPI detail, or not JSON)", async () => {
    answer(json({ detail: [{ loc: ["body", "file"], msg: "field required" }] }, 422));
    await expect(runFile(file)).rejects.toBeInstanceOf(EngineError);
    answer(new Response("<html>bad gateway</html>", { status: 400 }));
    const e = await runFile(file).catch((x: unknown) => x);
    expect(e).toMatchObject({ status: 400, kind: "rejected", message: "engine responded 400" });
  });
});
