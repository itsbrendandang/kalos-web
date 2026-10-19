import { describe, expect, it } from "vitest";
import { canActOnAnalysis, initialSetupState, isStale, nextAction, setupReducer, staleNotice, type SetupAction, type SetupState } from "@/lib/setup-attempt";

const f = (name: string) => new File(["a,b\n1,2"], name);
const run = (actions: SetupAction[], from: SetupState = initialSetupState) => actions.reduce(setupReducer, from);

describe("a failed upload never leaves the previous analysis actionable", () => {
  const mixed = f("mixed.csv");
  const bad = f("notes.txt");
  const good = run([{ type: "start" }, { type: "success", file: mixed }, { type: "confirm" }]);

  it("starts confirmed for the good file, and a successful upload resets confirmation", () => {
    expect(good).toMatchObject({ file: mixed, failed: null, confirmed: true });
    expect(run([{ type: "start" }, { type: "success", file: f("next.csv") }], good).confirmed).toBe(false);
  });

  it("a failed upload clears confirmation, names the new file, and keeps the old file only as the previous one", () => {
    const s = run([{ type: "start" }, { type: "failure", file: bad, error: "Unsupported file type" }], good);
    expect(s.confirmed).toBe(false);
    expect(s.file).toBe(mixed);
    expect(s.failed).toMatchObject({ name: "notes.txt", error: "Unsupported file type", refit: false });
    expect(isStale(s)).toBe(true);
    expect(canActOnAnalysis(s)).toBe(false);
    expect(staleNotice(s, "mixed.csv")).toBe("Showing the last successful analysis: mixed.csv. Your new file notes.txt was not used.");
  });

  it("cannot be confirmed while stale (a stale 'Looks right' click is ignored)", () => {
    const s = run([{ type: "start" }, { type: "failure", file: bad, error: "x" }, { type: "confirm" }], good);
    expect(s.confirmed).toBe(false);
  });

  it("offers no next step while stale", () => {
    const s = run([{ type: "start" }, { type: "failure", file: bad, error: "x" }], good);
    expect(nextAction(s, { hasAnalysis: true, validationFailed: false }).visible).toBe(false);
  });

  it("names the engine's dataset when no file is held (after a reload) and says so for a failed re-fit", () => {
    const afterReload = run([{ type: "start" }, { type: "failure", file: bad, error: "x" }]);
    expect(afterReload.file).toBeNull();
    expect(canActOnAnalysis(afterReload)).toBe(false);
    expect(staleNotice(afterReload, "old.csv")).toContain("old.csv");
    expect(staleNotice(afterReload, undefined)).toContain("the previous file");
    const refit = run([{ type: "start" }, { type: "failure", file: mixed, error: "x" }], good);
    expect(refit.failed?.refit).toBe(true);
    expect(staleNotice(refit, "mixed.csv")).toBe("Showing the last successful analysis: mixed.csv. This re-fit was not applied.");
  });

  it("the user can explicitly keep the previous file, which clears the failure but not the lost confirmation", () => {
    const failed = run([{ type: "start" }, { type: "failure", file: bad, error: "x" }], good);
    const kept = setupReducer(failed, { type: "keepPrevious" });
    expect(kept).toMatchObject({ file: mixed, failed: null, confirmed: false });
    expect(canActOnAnalysis(kept)).toBe(true);
  });

  it("a new attempt clears the failure; a success after a failure is the new file's, unconfirmed", () => {
    const failed = run([{ type: "start" }, { type: "failure", file: bad, error: "x" }], good);
    expect(setupReducer(failed, { type: "start" }).failed).toBeNull();
    const next = f("fresh.csv");
    expect(run([{ type: "start" }, { type: "success", file: next }], failed)).toMatchObject({ file: next, failed: null, confirmed: false });
  });
});

describe("confirmation is advisory (fix 8): the next step stays available, labelled honestly", () => {
  const opts = { hasAnalysis: true, validationFailed: false };
  it("unconfirmed with a held file: visible but secondary, with an 'optional' hint", () => {
    const s = run([{ type: "start" }, { type: "success", file: f("a.csv") }]);
    expect(nextAction(s, opts)).toEqual({ visible: true, emphasis: "secondary", hint: "Columns not confirmed yet (optional)" });
  });
  it("confirmed, or no file held (nothing to confirm after a reload): primary, no hint", () => {
    const s = run([{ type: "start" }, { type: "success", file: f("a.csv") }, { type: "confirm" }]);
    expect(nextAction(s, opts)).toEqual({ visible: true, emphasis: "primary", hint: null });
    expect(nextAction(initialSetupState, opts)).toEqual({ visible: true, emphasis: "primary", hint: null });
  });
  it("hidden without an analysis or when validation failed", () => {
    expect(nextAction(initialSetupState, { hasAnalysis: false, validationFailed: false }).visible).toBe(false);
    expect(nextAction(initialSetupState, { hasAnalysis: true, validationFailed: true }).visible).toBe(false);
  });
});
