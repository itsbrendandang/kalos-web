import { describe, expect, it } from "vitest";
import { localNextStep } from "@/lib/agent";
import { WHY } from "@/lib/why";
import type { Campaign } from "@/lib/api";
import {
  assistUnavailableReason,
  nextState,
  indexLine,
  isAssistAnswer,
  isAssistNext,
  isCloudProvider,
  nextActionLabel,
  numberLabel,
  sourceHref,
  sourceLabel,
  whereItRuns,
} from "@/lib/assist";

const SHA = "a".repeat(64);

describe("assistUnavailableReason", () => {
  it("tells an older engine (404 not_found) from an assistant that is off (404 assist_disabled)", () => {
    expect(assistUnavailableReason(404, "not_found")).toBe("absent");
    expect(assistUnavailableReason(404, null)).toBe("absent");
    expect(assistUnavailableReason(405, null)).toBe("absent");
    expect(assistUnavailableReason(404, "assist_disabled")).toBe("off");
  });
  it("is unavailable when the model did not answer, and null for any other failure", () => {
    expect(assistUnavailableReason(503, "assist_provider_unavailable")).toBe("unavailable");
    expect(assistUnavailableReason(500, null)).toBeNull();
    expect(assistUnavailableReason(401, "unauthenticated")).toBeNull();
  });
});

describe("sourceHref", () => {
  it("links a sheet, a round, a finding and the model results to their pages", () => {
    expect(sourceHref({ kind: "sheet", id: SHA })).toBe(`/data/sheet/${SHA}`);
    // The engine counts rounds from 0, the app from 1.
    expect(sourceHref({ kind: "round", id: "1" })).toBe("/data/round/2");
    expect(sourceHref({ kind: "finding", id: "near_constant_input.2" })).toBe("/campaign/learn#near_constant_input.2");
    expect(sourceHref({ kind: "analysis", id: "cv" })).toBe("/campaign/learn");
    expect(sourceHref({ kind: "analysis", id: "proposals" })).toBe("/campaign/plan");
  });
  it("has no page for a doc or a method, so the chip is not a link", () => {
    expect(sourceHref({ kind: "doc", id: "docs/ASSISTANT.md" })).toBeNull();
    expect(sourceHref({ kind: "skill", id: "run-sheet-checks" })).toBeNull();
  });
  it("never builds a path from an id that is not the expected shape", () => {
    expect(sourceHref({ kind: "sheet", id: "../x" })).toBe("/data");
    expect(sourceHref({ kind: "round", id: "2/../" })).toBe("/data");
    expect(sourceHref({ kind: "finding", id: "a b" })).toBe("/campaign/learn");
  });
});

describe("sourceLabel", () => {
  it("says the kind in plain words", () => {
    expect(sourceLabel({ kind: "sheet", id: SHA })).toBe("Sheet aaaaaaa");
    expect(sourceLabel({ kind: "round", id: "2" })).toBe("Round 3");
    expect(sourceLabel({ kind: "finding", id: "near_constant_input.2" })).toBe("Finding: near constant input");
    expect(sourceLabel({ kind: "doc", id: "docs/ASSISTANT.md" })).toBe("Guide page: ASSISTANT");
    expect(sourceLabel({ kind: "skill", id: "run-sheet-checks" })).toBe("Method: run sheet checks");
    expect(sourceLabel({ kind: "analysis", id: "drivers" })).toBe("What went with the target");
    expect(sourceLabel({ kind: "analysis", id: "round_delta" })).toBe("Since last round");
    expect(sourceLabel({ kind: "analysis", id: "something" })).toBe("Model results");
  });
});

describe("numberLabel", () => {
  it("keeps the word that says what a number is", () => {
    expect(numberLabel("Measured Titer 63.3 g/L in round 1")).toBe("Measured");
    expect(numberLabel("Predicted Titer 70.1 for recipe 2")).toBe("Predicted");
  });
  it("is null without a number, or when both words appear", () => {
    expect(numberLabel("The measured value is the one to trust")).toBeNull();
    expect(numberLabel("Measured 63.3, predicted 70.1")).toBeNull();
    expect(numberLabel("63.3")).toBeNull();
  });
});

describe("whereItRuns and the consent rule", () => {
  it("says on this Mac for a local model and names the provider otherwise", () => {
    expect(whereItRuns({ provider: "ollama", local: true, model: "qwen2.5:7b" })).toBe("Runs on this Mac (qwen2.5:7b). Nothing leaves it.");
    expect(whereItRuns({ provider: "anthropic", local: false, model: null })).toBe("Questions and the matching parts of your data are sent to Anthropic.");
    expect(whereItRuns({ provider: "none", local: true, model: null })).toBe("The assistant is off.");
  });
  it("needs consent only when answers leave the machine", () => {
    expect(isCloudProvider({ provider: "anthropic", local: false })).toBe(true);
    expect(isCloudProvider({ provider: "ollama", local: true })).toBe(false);
    expect(isCloudProvider({ provider: "none", local: true })).toBe(false);
  });
});

describe("indexLine", () => {
  const now = new Date("2026-05-01T12:00:00Z");
  it("counts passages and says when", () => {
    expect(indexLine({ chunks: 42, built_at: "2026-05-01T11:30:00Z", building: false }, now)).toBe("42 passages from your sheets, rounds and results, indexed 30 minutes ago.");
    expect(indexLine({ chunks: 1, built_at: "2026-05-01T11:59:50Z", building: false }, now)).toBe("1 passage from your sheets, rounds and results, indexed just now.");
  });
  it("says so while building and when nothing is indexed", () => {
    expect(indexLine({ chunks: 42, built_at: null, building: true }, now)).toBe("Rebuilding the index now.");
    expect(indexLine({ chunks: 0, built_at: null, building: false }, now)).toBe("Nothing is indexed yet.");
  });
});

describe("nextActionLabel", () => {
  it("uses the engine's route to name the stage, or the local action word for word", () => {
    expect(nextActionLabel({ action_route: "/campaign/record" })).toBe("Open Record");
    expect(nextActionLabel({ action_route: "/campaign/setup" })).toBe("Open Setup");
    expect(nextActionLabel({ action_route: "/somewhere" })).toBe("Open the next step");
    expect(nextActionLabel({ action_route: "/campaign/record", action: "Record 3 results" })).toBe("Record 3 results");
  });
});

describe("shape checks", () => {
  it("accepts the agreed guide and answer shapes and rejects half-filled ones", () => {
    const next = { state: "runs_awaiting", step: "Record the results.", why: "Three runs are back.", why_it_matters: "The model learns from them.", action_route: "/campaign/record", blockers: [{ code: "x", text: "One run has no result.", why: "It cannot be used yet." }], campaign_id: null };
    expect(isAssistNext(next)).toBe(true);
    expect(isAssistNext({ ...next, blockers: ["a string"] })).toBe(false);
    expect(isAssistNext({ ...next, step: "" })).toBe(false);
    // Only this app's stage pages may be linked: a route the engine made up is refused.
    expect(isAssistNext({ ...next, action_route: "https://example.com" })).toBe(false);
    expect(isAssistNext({ ...next, action_route: "/settings" })).toBe(false);
    expect(isAssistNext({ ...next, action_route: "/campaign/learn" })).toBe(true);
    expect(isAssistAnswer({ answer: "x", sources: [], abstained: true, next })).toBe(true);
    expect(isAssistAnswer({ answer: "x", sources: [{ kind: "sheet", id: SHA, quote: "q" }], abstained: false })).toBe(true);
    expect(isAssistAnswer({ answer: "x", sources: [{ kind: "sheet" }], abstained: false })).toBe(false);
  });
});

describe("nextState", () => {
  it("accepts the engine's old and new names for the two renamed states", () => {
    expect(nextState({ state: "batch_proposed" })).toBe("recipes_proposed");
    expect(nextState({ state: "recipes_proposed" })).toBe("recipes_proposed");
    expect(nextState({ state: "no_batch" })).toBe("no_recipes");
    expect(nextState({ state: "not_trusted" })).toBe("not_trusted");
    expect(nextState(null)).toBeNull();
  });
});

describe("localNextStep (the fallback for an engine without the guide)", () => {
  const base = { has_campaign: true as const, target: "t", features: [], n_base: 10, best: 1, round: 0, history: [], pending: [], n_awaiting: 0, n_measured: 0 };
  const run = (id: string, awaiting: boolean) => ({ id, recipe: {}, pred: 1, std: 0.1, mode: "exploit" as const, reason: "", result: awaiting ? null : 1.2, awaiting });

  it("points to Setup with no sheet, Plan with a proposed round, Record while runs are out, Learn when all are back", () => {
    expect(localNextStep({ has_data: false }, { has_campaign: false })).toMatchObject({ action_route: "/campaign/setup", blockers: [] });
    expect(localNextStep({ has_data: true, proposals: [1, 2] }, base)).toMatchObject({ action_route: "/campaign/plan", step: "Review the proposed runs." });
    const out: Campaign = { ...base, pending: [run("a", true), run("b", false)], n_awaiting: 1, n_measured: 1 };
    const rec = localNextStep({ has_data: true }, out);
    expect(rec.action_route).toBe("/campaign/record");
    expect(rec.blockers).toEqual([{ code: "runs_awaiting", text: "1 run of 2 has no result yet.", why: WHY.run_waiting }]);
    expect(rec.why_it_matters).toBe(WHY.record_partial);
    const back: Campaign = { ...base, pending: [run("a", false), run("b", false)], n_measured: 2 };
    expect(localNextStep({ has_data: true }, back)).toMatchObject({ action_route: "/campaign/learn", blockers: [] });
  });
});
