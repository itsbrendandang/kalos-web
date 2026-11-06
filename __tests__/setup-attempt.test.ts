import { describe, expect, it } from "vitest";
import { canActOnAnalysis, canChangeTarget, initialSetupState, isStale, nextAction, setupReducer, singleFlight, staleNotice, type SetupAction, type SetupState } from "@/lib/setup-attempt";

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
    expect(staleNotice(s, "mixed.csv")).toBe("Showing the last sheet Kalos read: mixed.csv. Your new file notes.txt was not used.");
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
    expect(staleNotice(afterReload, undefined)).toContain("the previous sheet");
    const refit = run([{ type: "start" }, { type: "failure", file: mixed, error: "x" }], good);
    expect(refit.failed?.refit).toBe(true);
    expect(staleNotice(refit, "mixed.csv")).toBe("Showing the last sheet Kalos read: mixed.csv. The model was not rebuilt with your new columns.");
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

describe("setup page guards", () => {
  it("a failed attempt never becomes the held file: the previous successful file stays", () => {
    const first = new File(["a"], "first.csv");
    const second = new File(["b"], "second.csv");
    let s = setupReducer(initialSetupState, { type: "success", file: first });
    s = setupReducer(s, { type: "start" });
    s = setupReducer(s, { type: "failure", file: second, error: "too few rows" });
    expect(s.file).toBe(first);
    expect(s.failed?.file).toBe(second);
  });

  it("the target picker is off while a fit is running, even for a current analysis", () => {
    const f = new File(["a"], "a.csv");
    const ready = setupReducer(initialSetupState, { type: "success", file: f });
    expect(canChangeTarget(ready, false)).toBe(true);
    expect(canChangeTarget(ready, true)).toBe(false);
    expect(canChangeTarget(setupReducer(ready, { type: "failure", file: f, error: "x" }), false)).toBe(false);
  });

  it("singleFlight refuses a call made while one is in flight, and accepts the next after it settles", async () => {
    const run = singleFlight();
    let release!: () => void;
    const first = run(() => new Promise<string>((r) => (release = () => r("one"))));
    expect(await run(async () => "two")).toBeNull();
    release();
    await expect(first).resolves.toBe("one");
    await expect(run(async () => "three")).resolves.toBe("three");
  });

  it("singleFlight frees itself when the action throws", async () => {
    const run = singleFlight();
    await expect(run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(run(async () => "ok")).resolves.toBe("ok");
  });
});
