import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API,
  CampaignHasRunsError,
  cancelJob,
  createCampaign,
  getCampaignAnalysis,
  getCampaignDetail,
  getJob,
  isJobActive,
  listCampaigns,
  listJobs,
  reanalyzeCampaign,
  recordCampaignResult,
  startCampaignRuns,
  submitUploadJob,
  updateCampaign,
  type Job,
} from "@/lib/api";
import { ENGINE_CSRF_HEADER } from "@/lib/engine-csrf";
import { EngineError, errorMessage } from "@/lib/engine-error";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const CMP = "cmp_0123456789abcdef0123456789abcdef";

const job = (over: Partial<Job> = {}): Job => ({
  id: "job_1",
  campaign_id: CMP,
  kind: "analysis",
  state: "queued",
  stage: "queued",
  progress: 0,
  attempts: 0,
  created_at: 1,
  started_at: null,
  finished_at: null,
  updated_at: 1,
  cancel_requested: false,
  input_bytes: 10,
  error: null,
  campaign_generation: null,
  ...over,
});

describe("multi-campaign client (lib/api.ts)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit | undefined];

  it("lists campaigns, with archived ones only on request", async () => {
    fetchMock.mockImplementation(async () => json({ campaigns: [{ id: CMP, name: "A" }] }));
    expect(await listCampaigns()).toEqual([{ id: CMP, name: "A" }]);
    expect(lastCall()[0]).toBe(`${API}/api/campaigns`);
    await listCampaigns(true);
    expect(lastCall()[0]).toBe(`${API}/api/campaigns?include_archived=true`);
  });

  it("creates and renames with CSRF-marked JSON writes", async () => {
    fetchMock.mockImplementation(async () => json({ id: CMP, name: "Run 7" }, 201));
    await createCampaign("Run 7");
    let [url, init] = lastCall();
    expect(url).toBe(`${API}/api/campaigns`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Run 7" });
    expect((init?.headers as Record<string, string>)[ENGINE_CSRF_HEADER]).toBeDefined();
    await updateCampaign(CMP, { name: "Run 8" });
    [url, init] = lastCall();
    expect(url).toBe(`${API}/api/campaigns/${CMP}`);
    expect(init?.method).toBe("PATCH");
  });

  it("reads a campaign's detail and analysis from its own routes", async () => {
    fetchMock.mockResolvedValueOnce(json({ campaign: { id: CMP }, summary: { has_campaign: false } }));
    expect((await getCampaignDetail(CMP)).campaign.id).toBe(CMP);
    expect(lastCall()[0]).toBe(`${API}/api/campaigns/${CMP}`);
    fetchMock.mockResolvedValueOnce(json({ has_data: false }));
    expect(await getCampaignAnalysis(CMP)).toEqual({ has_data: false });
    expect(lastCall()[0]).toBe(`${API}/api/campaigns/${CMP}/analysis`);
  });

  it("a 404 is a typed EngineError, so the shell can say 'not found' instead of 'offline'", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "campaign not found", code: "not_found" }, 404));
    const err = await getCampaignDetail("cmp_x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).status).toBe(404);
    expect((err as EngineError).code).toBe("not_found");
  });

  it("a network failure is engine_unreachable, never a fake empty answer", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const err = await listCampaigns().catch((e: unknown) => e);
    expect((err as EngineError).code).toBe("engine_unreachable");
  });

  describe("submitUploadJob", () => {
    const file = new File(["a,b\n1,2\n"], "runs.csv", { type: "text/csv" });

    it("sends the upload as multipart with its options and returns the queued job", async () => {
      fetchMock.mockResolvedValueOnce(json({ job: job() }, 202));
      const out = await submitUploadJob(CMP, file, { target: "titer", sheet: "Runs", replace: true, roles: { target: "titer", features: ["pH"] } });
      expect(out).toEqual({ job: job() });
      const [url, init] = lastCall();
      expect(url).toBe(`${API}/api/campaigns/${CMP}/jobs`);
      const fd = init?.body as FormData;
      expect(fd.get("target")).toBe("titer");
      expect(fd.get("sheet")).toBe("Runs");
      expect(fd.get("replace")).toBe("true");
      expect(JSON.parse(String(fd.get("roles")))).toEqual({ target: "titer", features: ["pH"] });
    });

    it("returns a pre-fit refusal (400) inline, like /api/run", async () => {
      fetchMock.mockResolvedValueOnce(json({ error: "too few rows", code: "too_few_rows" }, 400));
      expect(await submitUploadJob(CMP, file)).toEqual({ refused: { error: "too few rows", code: "too_few_rows" } });
    });

    it("throws CampaignHasRunsError on 409 campaign_has_runs", async () => {
      fetchMock.mockResolvedValueOnce(json({ error: "has runs", code: "campaign_has_runs", n_awaiting: 3, n_measured: 1 }, 409));
      const err = await submitUploadJob(CMP, file).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CampaignHasRunsError);
      expect((err as CampaignHasRunsError).awaiting).toBe(3);
    });

    it("throws a typed upload_pending on the one-upload-per-campaign 409", async () => {
      fetchMock.mockResolvedValueOnce(json({ error: "an upload is already pending", code: "upload_pending" }, 409));
      const err = await submitUploadJob(CMP, file).catch((e: unknown) => e);
      expect((err as EngineError).code).toBe("upload_pending");
      expect(errorMessage(err).message).toMatch(/already analyzing/);
    });

    it("maps a busy engine (503 without a body) to engine_busy", async () => {
      fetchMock.mockResolvedValueOnce(new Response("busy", { status: 503 }));
      const err = await submitUploadJob(CMP, file).catch((e: unknown) => e);
      expect((err as EngineError).code).toBe("engine_busy");
    });
  });

  it("polls, lists and cancels jobs", async () => {
    fetchMock.mockResolvedValueOnce(json({ job: job({ state: "running", stage: "fitting", progress: 0.15 }) }));
    expect((await getJob("job_1")).stage).toBe("fitting");
    expect(lastCall()[0]).toBe(`${API}/api/jobs/job_1`);
    fetchMock.mockResolvedValueOnce(json({ jobs: [job()] }));
    await listJobs(CMP, 1);
    expect(lastCall()[0]).toBe(`${API}/api/campaigns/${CMP}/jobs?limit=1`);
    fetchMock.mockResolvedValueOnce(json({ job: job({ state: "cancelled" }) }));
    expect((await cancelJob("job_1")).state).toBe("cancelled");
    expect(lastCall()[1]?.method).toBe("POST");
  });

  it("isJobActive is true only while queued or running", () => {
    expect(isJobActive(job({ state: "queued" }))).toBe(true);
    expect(isJobActive(job({ state: "running" }))).toBe(true);
    for (const s of ["succeeded", "failed", "cancelled", "timed_out"] as const) expect(isJobActive(job({ state: s }))).toBe(false);
    expect(isJobActive(null)).toBe(false);
  });

  it("starts runs, records results (reason only for a correction) and re-analyzes on the campaign's routes", async () => {
    fetchMock.mockImplementation(async () => json({ started: [] }));
    await startCampaignRuns(CMP, [{ recipe: { pH: 7 }, pred: 1, std: 0.1, mode: "exploit", reason: "r" }]);
    expect(lastCall()[0]).toBe(`${API}/api/campaigns/${CMP}/runs`);
    await recordCampaignResult(CMP, "run1", 1.5);
    expect(lastCall()[0]).toBe(`${API}/api/campaigns/${CMP}/runs/run1/result`);
    expect(JSON.parse(String(lastCall()[1]?.body))).toEqual({ value: 1.5 });
    await recordCampaignResult(CMP, "run1", 1.6, "typo in the assay sheet");
    expect(JSON.parse(String(lastCall()[1]?.body))).toEqual({ value: 1.6, reason: "typo in the assay sheet" });
    await reanalyzeCampaign(CMP);
    expect(lastCall()[0]).toBe(`${API}/api/campaigns/${CMP}/reanalyze`);
  });

  it("a correction without a reason surfaces the engine's reason_required as plain copy", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "a correction needs a reason", code: "reason_required" }, 400));
    const err = await recordCampaignResult(CMP, "run1", 2).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe("reason_required");
    expect(errorMessage(err).message).toMatch(/needs a reason/);
  });

  it("an unknown engine code falls back to the engine's own sentence, never the raw code", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "Nothing to fold in yet.", code: "invalid_request" }, 400));
    const err = await reanalyzeCampaign(CMP).catch((e: unknown) => e);
    expect(errorMessage(err).message).toBe("Nothing to fold in yet.");
  });
});
