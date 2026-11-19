import { describe, expect, it } from "vitest";
import type { CampaignMeta, CampaignSummaryRow } from "@/lib/api";
import { EngineError } from "@/lib/engine-error";
import { ARCHIVE_STEP_UP_SECONDS, archiveErrorCopy, nameErrorMessage, NAME_MAX, sortCampaigns, summaryRowView, validateCampaignName } from "@/lib/home";
import { RECENT_AUTH_MAX_AGE_SECONDS } from "@/lib/server/session-context";
import summaries from "./fixtures/home-v2-summary-campaigns.json";

const meta = (over: Partial<CampaignMeta> = {}): CampaignMeta => ({
  id: "cmp_1",
  name: "Line 4",
  created_by: null,
  created_at: 1,
  updated_at: 1,
  archived_at: null,
  archived: false,
  seeded: true,
  is_default: false,
  ...over,
});

describe("validateCampaignName", () => {
  it("trims and accepts 1 to 120 characters", () => {
    expect(validateCampaignName("  CHO titer  ")).toEqual({ ok: true, name: "CHO titer" });
    expect(validateCampaignName("a".repeat(NAME_MAX)).ok).toBe(true);
  });

  it("refuses empty, too long, and control characters with a sentence", () => {
    expect(validateCampaignName("   ")).toEqual({ ok: false, message: "Give the campaign a name." });
    const long = validateCampaignName("a".repeat(NAME_MAX + 1));
    expect(long.ok).toBe(false);
    expect(!long.ok && long.message).toContain("121");
    expect(validateCampaignName("a\tb").ok).toBe(false);
    expect(validateCampaignName("a\u0007b").ok).toBe(false);
    expect(validateCampaignName("a\u0085b").ok).toBe(false);
  });

  it("counts characters, not UTF-16 units", () => {
    expect(validateCampaignName("🧪".repeat(NAME_MAX)).ok).toBe(true);
  });
});

describe("nameErrorMessage", () => {
  it("turns the engine's 400 rule into a sentence, never the raw envelope", () => {
    const err = new EngineError(400, "invalid_body", undefined, "invalid request body: name: Value error, name must be 1-120 characters");
    expect(nameErrorMessage(err)).toBe("The engine refused this name: it must be 1-120 characters.");
    const ctl = new EngineError(400, "invalid_body", undefined, "invalid request body: name: Value error, name must not contain control characters");
    expect(nameErrorMessage(ctl)).toBe("The engine refused this name: it must not contain control characters.");
  });

  it("says a 403 is a permission, and a dropped connection is a connection problem", () => {
    expect(nameErrorMessage(new EngineError(403, "forbidden"))).toMatch(/role/);
    expect(nameErrorMessage(new EngineError(0, "engine_unreachable"))).toMatch(/did not respond/);
    expect(nameErrorMessage(new Error("boom"))).toMatch(/did not respond/);
  });
});

describe("sortCampaigns", () => {
  it("puts the most recently updated first without mutating the input", () => {
    const list = [meta({ id: "a", updated_at: 1 }), meta({ id: "b", updated_at: 3 }), meta({ id: "c", updated_at: 2 })];
    expect(sortCampaigns(list).map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(list.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("summaryRowView (one summary list request, no per-campaign fetch)", () => {
  const [probe, capture] = summaries.campaigns as unknown as CampaignSummaryRow[];

  it("reads a minimize campaign from the engine summary: lowest measured, reliability verdict, no stage or gate", () => {
    const v = summaryRowView(probe);
    expect(v).toMatchObject({ hasData: true, target: "titer_g_L", goal: "minimize", stale: false, stage: null, gate: null, job: null, round: 1, awaiting: 0, measured: 0 });
    // 0 is a real measured minimum here (best_measured.value 0.0), so it stays 0, not n/a.
    expect(v.best).toEqual({ value: 0, word: "lowest measured" });
    expect(v.reliability).toMatchObject({ kind: "verdict", label: "Reliable" });
    // The summary has no target_unit: parseUnit reads only a trailing "(unit)", so titer_g_L has none here.
    expect(v.unit).toBeNull();
  });

  it("uses the summary's target_unit when the engine sends it (754a87a), including an explicit none", () => {
    expect(summaryRowView({ ...probe, target_unit: { unit: "g/L", source: "header", header: "titer_g_L", note: "" } }).unit).toBe("g/L");
    expect(summaryRowView({ ...probe, target: "titer (g/L)", target_unit: { unit: null, source: "none", header: "titer (g/L)", note: "" } }).unit).toBeNull();
  });

  it("flags an analysis that predates newer results, and maximize reads as highest measured", () => {
    const v = summaryRowView(capture);
    expect(v.goal).toBe("maximize");
    expect(v.best).toEqual({ value: 1.422, word: "highest measured" });
    expect(v.stale).toBe(true);
    expect(v.awaiting).toBe(1);
  });

  it("an empty campaign has no numbers (null, never 0) and reliability n/a", () => {
    const v = summaryRowView({ ...probe, has_data: false, target: null, best_measured: null, analysis: { present: false }, goal: undefined });
    expect(v).toMatchObject({ hasData: false, round: null, awaiting: null, measured: null, stale: false, goal: "maximize" });
    expect(v.best.value).toBeNull();
    expect(v.reliability).toEqual({ kind: "na", reason: "no data yet" });
  });

  it("shows the recorded stage key, the latest gate decision in words and the engine's job stage and progress", () => {
    const v = summaryRowView({
      ...capture,
      target: "Titer (g/L)",
      current_stage: "S3",
      latest_gate_decision: { gate: "S2", decision: "no_go", decided_at: 1_795_000_000 },
      active_job: { id: "job_1", kind: "reanalyze", state: "running", progress: 0.25, stage: "fitting" },
    });
    expect(v.unit).toBe("g/L");
    expect(v.stage).toBe("S3");
    expect(v.gate).toEqual({ gate: "S2", word: "No-go", decidedAt: 1_795_000_000 });
    expect(v.job).toEqual({ kind: "Re-analysis", stage: "fitting the model", progress: 0.25 });
  });
});

describe("archive", () => {
  it("states the same step-up window the server enforces", () => {
    expect(ARCHIVE_STEP_UP_SECONDS).toBe(RECENT_AUTH_MAX_AGE_SECONDS);
  });

  it("explains the proxy's admin refusal in plain words", () => {
    const c = archiveErrorCopy(new EngineError(403, "insufficient_scope"), "archive");
    expect(c.message).toMatch(/Only organization admins can archive/);
    expect(c.fix).toMatch(/Ask an organization admin/);
    expect(c.signOut).toBe(false);
    expect(c.message).not.toMatch(/insufficient_scope/);
  });

  it("explains the step-up refusal with the window and how to get a fresh second factor", () => {
    // The proxy sends { error: "step_up_required", code: "STEP_UP_REQUIRED" }.
    const c = archiveErrorCopy(new EngineError(403, "STEP_UP_REQUIRED", undefined, "step_up_required"), "unarchive");
    expect(c.message).toMatch(/second factor in the last 5 minutes/);
    expect(c.fix).toMatch(/Sign out, sign back in with your second factor, then unarchive again within 5 minutes/);
    expect(c.signOut).toBe(true);
  });

  it("falls back to the shared copy for other failures", () => {
    expect(archiveErrorCopy(new EngineError(409, "campaign_archived"), "archive").message).toMatch(/already archived/);
    expect(archiveErrorCopy(new EngineError(0, "engine_unreachable"), "archive").message).toMatch(/did not respond/);
  });
});
