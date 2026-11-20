import { describe, expect, it } from "vitest";
import { JOB_STAGES, jobStageIndex, jobStageLabel, jobStages, REANALYZE_STAGES } from "@/components/kit/job-progress";
import { jobStatusLine } from "@/components/overview/activity";

describe("job stage lists by engine job kind", () => {
  it("a re-analysis job uses the engine's re-analysis stages (planning, no parsing)", () => {
    expect(jobStages("reanalyze").map((s) => s.key)).toEqual(["queued", "planning", "fitting", "calibrating", "proposing", "publishing"]);
    expect(jobStages("reanalyze")).toBe(REANALYZE_STAGES);
    expect(jobStageIndex("planning", "reanalyze")).toBe(1);
  });
  it("an upload analysis (or an older job without a kind) keeps the upload list", () => {
    expect(jobStages("analysis")).toBe(JOB_STAGES);
    expect(jobStages(undefined)).toBe(JOB_STAGES);
    expect(jobStageIndex("parsing", "analysis")).toBe(1);
    expect(jobStageIndex("planning", "analysis")).toBe(0); // unknown stage for this kind: not invented
  });
  it("names the stage in plain words, and an unknown stage as Working", () => {
    expect(jobStageLabel({ kind: "reanalyze", stage: "fitting" })).toBe("Re-fitting the model and cross-validating");
    expect(jobStageLabel({ kind: "reanalyze", stage: "mystery" })).toBe("Working");
  });
  it("the Overview line is the engine's stage and progress, never a made-up percentage", () => {
    expect(jobStatusLine({ kind: "reanalyze", stage: "calibrating", progress: 0.55 })).toBe("Checking the model's reliability and intervals, 55% as reported by the engine.");
    expect(jobStatusLine({ kind: "analysis", stage: "parsing", progress: 1.4 })).toBe("Reading and checking the sheet, 100% as reported by the engine.");
  });
});
