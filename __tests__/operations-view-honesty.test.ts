import { describe, expect, it, vi } from "vitest";
import type { LatestResult } from "@/lib/api";
import type { ExperimentSummary } from "@/lib/experiments";

// operations-view.tsx renders a `next/link` Link - a real framework import
// that this project's node-environment vitest config (see vitest.config.ts:
// "no jsdom, no React plugin - nothing under test renders a component") isn't
// set up to resolve; importing it unmocked hangs the run. `liveBoardState`/
// `queueState` are plain functions with no rendering involved, so the mock
// only exists to let the module load - nothing here exercises the component.
vi.mock("next/link", () => ({ default: () => null }));

const { liveBoardState, queueState } = await import("@/components/operations/operations-view");

/**
 * Regression coverage for the honesty bug: components/operations/operations-view.tsx
 * used to set `err`/`liveErr` on a rejected fetch and never render them, so
 * `loadingLive = live == null && !liveErr` and `loadingPortal = data == null
 * && !err` both fell straight through to the "confirmed empty" branch on a
 * dropped connection - rendering "No live runs" / "No live proposals yet.",
 * which are assertions about the physical lab, from a failed fetch.
 *
 * `liveBoardState`/`queueState` are the pure classifiers the component now
 * renders from. The contract under test: an errored fetch must classify as
 * "error" - never "empty"/"data" (whose branches are what render the empty
 * copy) - regardless of what `live`/`data` happen to hold.
 */
describe("operations-view honesty: rejected fetch must not classify as empty", () => {
  const sampleLive: ExperimentSummary[] = [
    { id: "exp_1", name: "Media screen", status: "READY", updated_at: "2026-08-08T00:00:00Z" },
  ];
  const sampleData: LatestResult = { has_data: false };

  it("liveBoardState is 'error' on a rejected fetch, never 'empty', with no prior data", () => {
    const state = liveBoardState(null, true, false);
    expect(state).toBe("error");
    expect(state).not.toBe("empty");
  });

  it("liveBoardState is 'error' on a rejected fetch even with demo mode on", () => {
    // Demo mode must not paper over a real transport failure either.
    const state = liveBoardState(null, true, true);
    expect(state).toBe("error");
    expect(state).not.toBe("demo");
    expect(state).not.toBe("empty");
  });

  it("liveBoardState is 'error' on a rejected fetch even when stale data survives from an earlier success", () => {
    const state = liveBoardState(sampleLive, true, false);
    expect(state).toBe("error");
    expect(state).not.toBe("live");
  });

  it("liveBoardState is 'empty' only for a confirmed-empty, non-errored fetch with demo mode off", () => {
    expect(liveBoardState([], false, false)).toBe("empty");
  });

  it("liveBoardState is 'loading' before the fetch settles, not 'error' or 'empty'", () => {
    expect(liveBoardState(null, false, false)).toBe("loading");
  });

  it("queueState is 'error' on a rejected fetch, never 'data', with no prior data", () => {
    const state = queueState(null, true);
    expect(state).toBe("error");
    expect(state).not.toBe("data");
  });

  it("queueState is 'error' on a rejected fetch even when stale data survives from an earlier success", () => {
    const state = queueState(sampleData, true);
    expect(state).toBe("error");
  });

  it("queueState is 'data' only for a confirmed, non-errored fetch", () => {
    expect(queueState(sampleData, false)).toBe("data");
  });

  it("queueState is 'loading' before the fetch settles, not 'error' or 'data'", () => {
    expect(queueState(null, false)).toBe("loading");
  });
});
