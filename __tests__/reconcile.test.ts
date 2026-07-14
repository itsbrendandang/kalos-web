import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWithReconcile } from "@/lib/reconcile";
import { ExperimentApiError, patchStatus, runExperiment, runReady } from "@/lib/experiments";

/** Minimal Response stand-in - only the members lib/experiments.ts reads. */
function fakeResponse(ok: boolean, status: number, body: unknown): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

/** app/experiments/page.tsx wires its optimistic-update actions
 *  (withBusy/handleRunAll) through runWithReconcile so that a failed
 *  PATCH/run always reconciles local state back to server truth via the
 *  `reconcile` callback (which calls refresh -> listExperiments), regardless
 *  of whether the action resolved or rejected. These tests exercise the
 *  real lib/experiments.ts client functions against a rejected (non-2xx)
 *  fetch and assert `reconcile` still runs - this is the regression guard:
 *  if a future refactor dropped the `finally` in runWithReconcile (or
 *  page.tsx stopped routing its actions through it), these would fail. */
describe("lib/reconcile.ts - runWithReconcile", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls reconcile once the action resolves", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(true, 200, {
        id: "exp_1",
        name: "n",
        status: "DONE",
        created_at: "t",
        updated_at: "t",
        config: { target: "titer", anonymize: false },
        payload: { columns: [], rows: [] },
        result: null,
        provenance: null,
        error: null,
      }),
    );
    const reconcile = vi.fn();

    await runWithReconcile(() => runExperiment("exp_1"), reconcile);

    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("still calls reconcile when runExperiment rejects (a failed run must reconcile the optimistic PROCESSING status back to server truth)", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, { error: "already processing" }));
    const reconcile = vi.fn();
    const onError = vi.fn();

    await runWithReconcile(() => runExperiment("exp_2"), reconcile, onError);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(ExperimentApiError));
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("still calls reconcile when patchStatus rejects, even with no onError handler supplied", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, { error: "cannot flag a PROCESSING experiment as READY" }));
    const reconcile = vi.fn();

    await runWithReconcile(() => patchStatus("exp_3", "READY"), reconcile);

    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("still calls reconcile when runReady (run all ready) rejects", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 500, {}));
    const reconcile = vi.fn();
    const onError = vi.fn();

    await runWithReconcile(runReady, reconcile, onError);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("runs onError before reconcile, matching the page's set-error-then-clear-busy-then-refresh order", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, { error: "boom" }));
    const order: string[] = [];
    const reconcile = vi.fn(() => order.push("reconcile"));
    const onError = vi.fn(() => order.push("onError"));

    await runWithReconcile(() => runExperiment("exp_4"), reconcile, onError);

    expect(order).toEqual(["onError", "reconcile"]);
  });

  it("does not call onError when the action resolves", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(false, 409, { error: "cannot flag a PROCESSING experiment as READY" }));
    // Reuse a rejection to first assert the failure path, then a fresh
    // resolution to assert the success path never touches onError.
    const reconcileFail = vi.fn();
    const onErrorFail = vi.fn();
    await runWithReconcile(() => patchStatus("exp_5", "READY"), reconcileFail, onErrorFail);
    expect(onErrorFail).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(
      fakeResponse(true, 200, {
        id: "exp_6",
        name: "n",
        status: "READY",
        created_at: "t",
        updated_at: "t",
        config: { target: "titer", anonymize: false },
        payload: { columns: [], rows: [] },
        result: null,
        provenance: null,
        error: null,
      }),
    );
    const reconcileOk = vi.fn();
    const onErrorOk = vi.fn();
    await runWithReconcile(() => patchStatus("exp_6", "READY"), reconcileOk, onErrorOk);

    expect(onErrorOk).not.toHaveBeenCalled();
    expect(reconcileOk).toHaveBeenCalledTimes(1);
  });
});
