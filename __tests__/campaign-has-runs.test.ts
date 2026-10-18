import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API, CampaignHasRunsError, campaignHasRunsRefusal, runFile } from "@/lib/api";

/** Minimal Response stand-in - only the members lib/api.ts reads. */
function fakeResponse(ok: boolean, status: number, body: unknown): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

const sheet = () => new File(["a,b\n1,2"], "sheet.csv", { type: "text/csv" });
const refusalBody = { error: "campaign_has_runs", code: "campaign_has_runs", awaiting: 3, measured: 7 };

describe("campaign_has_runs refusal (lib/api.ts)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runFile without replace sends no replace field", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, { n: 2 }));
    await runFile(sheet(), "yield");
    const fd = fetchMock.mock.calls[0][1].body as FormData;
    expect(fd.has("replace")).toBe(false);
    expect(fd.get("target")).toBe("yield");
  });

  it("runFile with replace sends replace=true alongside the same file", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(true, 200, { n: 2 }));
    const f = sheet();
    await runFile(f, undefined, { replace: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/api/run`);
    const fd = init.body as FormData;
    expect(fd.get("replace")).toBe("true");
    expect(fd.get("file")).toBeInstanceOf(File);
  });

  it("a 409 campaign_has_runs throws a typed error with the counts", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, refusalBody));
    const err = await runFile(sheet()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CampaignHasRunsError);
    expect(err).toMatchObject({ code: "campaign_has_runs", awaiting: 3, measured: 7 });
  });

  it("a 409 is refused even though the body carries an error string (not returned as a result)", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, { error: "campaign_has_runs" }));
    await expect(runFile(sheet())).rejects.toBeInstanceOf(CampaignHasRunsError);
  });

  it("accepts n_awaiting / n_measured count names and leaves counts null when absent", () => {
    const named = campaignHasRunsRefusal(409, { code: "campaign_has_runs", n_awaiting: 1, n_measured: 0 });
    expect(named).toMatchObject({ awaiting: 1, measured: 0 });
    const bare = campaignHasRunsRefusal(409, { code: "campaign_has_runs" });
    expect(bare).toMatchObject({ awaiting: null, measured: null });
  });

  it("other 409s are not the refusal and keep the generic error path", async () => {
    expect(campaignHasRunsRefusal(409, { code: "some_other_conflict" })).toBeNull();
    expect(campaignHasRunsRefusal(500, refusalBody)).toBeNull();
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, { code: "some_other_conflict" }));
    const err = await runFile(sheet()).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(CampaignHasRunsError);
    expect((err as Error).message).toBe("engine responded 409");
  });

  it("a 400 bad-sheet response is still returned inline, not thrown", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 400, { error: "no target column" }));
    await expect(runFile(sheet())).resolves.toEqual({ error: "no target column" });
  });
});
