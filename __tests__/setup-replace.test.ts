import { describe, expect, it } from "vitest";
import { LONG_FIT_SECONDS, needsReplaceConfirm, replaceConfirmText, uploadFailure } from "@/components/campaign/upload-zone";
import { isCorrection, reasonProblem, rowsNeedingReason } from "@/components/campaign/record-form";
import type { CampaignRun } from "@/lib/api";
import { describeEngineError, EngineError } from "@/lib/engine-error";

const err = (status: number, code: string | null = null, message = "engine said no", retryAfter: number | null = null) =>
  new EngineError(message, status, code, retryAfter);

describe("needsReplaceConfirm: ask before a fit that would drop runs", () => {
  it("asks when the campaign has pending runs (older engines never send the 409)", () => {
    expect(needsReplaceConfirm({ has_campaign: true, pending: [{}] })).toBe(true);
  });
  it("does not ask without a campaign, without pending runs, or before the campaign has loaded", () => {
    expect(needsReplaceConfirm({ has_campaign: false })).toBe(false);
    expect(needsReplaceConfirm({ has_campaign: true, pending: [] })).toBe(false);
    expect(needsReplaceConfirm(null)).toBe(false);
    expect(needsReplaceConfirm(undefined)).toBe(false);
  });
});

describe("replaceConfirmText", () => {
  it("names what each trigger does and the counts it drops", () => {
    expect(replaceConfirmText("upload", 3, 2)).toBe(
      "Fitting a different run sheet starts a new campaign. It drops the 3 runs awaiting results and the 2 recorded results not yet in the model. This cannot be undone.",
    );
    expect(replaceConfirmText("target", 1, 0)).toMatch(/^Changing what to maximize re-fits the model and starts a new campaign\. It drops the 1 run awaiting results\./);
    expect(replaceConfirmText("roles", 0, 1)).toMatch(/^Re-fitting with these columns starts a new campaign\. It drops the 1 recorded result not yet in the model\./);
  });
  it("falls back to a general sentence when the counts are missing or zero", () => {
    expect(replaceConfirmText("upload", undefined, null)).toContain("It drops the runs in the current campaign.");
    expect(replaceConfirmText("upload", 0, 0)).toContain("It drops the runs in the current campaign.");
  });
});

describe("uploadFailure: how the Setup page shows a thrown upload error", () => {
  it("turns 409 campaign_has_runs into the confirmation, not an error", () => {
    expect(uploadFailure(err(409, "campaign_has_runs"), 1)).toEqual({ kind: "confirm" });
  });
  it("shows other 409s (campaign_changed, archived) as a plain failure with the engine's sentence", () => {
    const f = uploadFailure(err(409, "campaign_changed", "the campaign changed while the sheet was analyzed"), 40);
    expect(f).toEqual({ kind: "other", title: "The upload did not go through", message: "the campaign changed while the sheet was analyzed" });
  });
  it("never says the sheet could not be analyzed for busy, auth or rate limits", () => {
    for (const e of [err(503, "busy", "x", 7), err(401), err(403), err(429, null, "x", 3), err(500)]) {
      const f = uploadFailure(e, 5);
      expect(f.kind).toBe("other");
      if (f.kind !== "confirm") {
        expect(f.message).toBe(describeEngineError(e));
        expect(f.title).not.toMatch(/could not be analyzed/);
      }
    }
    const busy = uploadFailure(err(503, "busy", "x", 7), 5);
    expect(busy.kind !== "confirm" && busy.message).toMatch(/busy.*about 7 s/);
  });
  it("offers Check again for a 502/504 or a network failure, and says a long fit may still be finishing", () => {
    const quick = uploadFailure(err(502), 4);
    expect(quick).toMatchObject({ kind: "unreachable", message: describeEngineError(err(502)) });
    const long = uploadFailure(err(504), LONG_FIT_SECONDS + 60);
    expect(long.kind).toBe("unreachable");
    expect(long.kind !== "confirm" && long.message).toMatch(/may still be finishing/);
    expect(uploadFailure(new TypeError("Failed to fetch"), 2).kind).toBe("unreachable");
  });
});

const run = (over: Partial<CampaignRun>): CampaignRun => ({
  id: "r1",
  recipe: { pH: 7 },
  pred: 4,
  std: 0.2,
  mode: "exploit",
  reason: "",
  result: null,
  awaiting: true,
  ...over,
});

describe("record form: corrections need a reason", () => {
  it("treats a run with a recorded value as a correction, and an awaiting one as a first value", () => {
    expect(isCorrection(run({ awaiting: false, result: 4.5 }))).toBe(true);
    expect(isCorrection(run({ awaiting: false, result: 0 }))).toBe(true);
    expect(isCorrection(run({ awaiting: true, result: null }))).toBe(false);
  });
  it("requires a non-blank reason of at most 256 characters", () => {
    expect(reasonProblem(undefined)).toMatch(/why/);
    expect(reasonProblem("   ")).toMatch(/why/);
    expect(reasonProblem("transcription error")).toBeNull();
    expect(reasonProblem("x".repeat(256))).toBeNull();
    expect(reasonProblem("x".repeat(257))).toMatch(/256 characters/);
    expect(reasonProblem(`  ${"x".repeat(256)}  `)).toBeNull();
  });
  it("asks for a reason on changed corrections and on runs the engine said need one", () => {
    const runs = [run({ id: "a" }), run({ id: "b", awaiting: false, result: 4.5 }), run({ id: "c" })];
    const rows = [
      { id: "a", value: 4 },
      { id: "b", value: 4.9 },
      { id: "c", value: 3 },
    ];
    expect(rowsNeedingReason(rows, runs, new Set())).toEqual(["b"]);
    // Run c was recorded elsewhere after this page loaded: the engine answered reason_required.
    expect(rowsNeedingReason(rows, runs, new Set(["c"]))).toEqual(["b", "c"]);
    // Only changed rows are asked about.
    expect(rowsNeedingReason([{ id: "a", value: 4 }], runs, new Set())).toEqual([]);
  });
});
