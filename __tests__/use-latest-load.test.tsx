// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLatestLoad, type Fetched } from "@/hooks/use-latest-load";

/** A fetcher whose calls resolve only when the test says so, in any order. */
function deferredFetcher<T>() {
  const pending: ((r: Fetched<T>) => void)[] = [];
  const fetcher = vi.fn(() => new Promise<Fetched<T>>((resolve) => pending.push(resolve)));
  return { fetcher, resolve: (i: number, r: Fetched<T>) => act(async () => pending[i](r)) };
}

describe("useLatestLoad", () => {
  it("keeps the newest response when an older one lands last", async () => {
    const { fetcher, resolve } = deferredFetcher<number>();
    const { result, rerender } = renderHook(({ k }: { k: string | null }) => useLatestLoad(fetcher, k), { initialProps: { k: "a1" } });
    rerender({ k: "a2" }); // the analysis is replaced while the first read is in flight
    expect(fetcher).toHaveBeenCalledTimes(2);
    await resolve(1, { status: "data", data: 2 });
    await resolve(0, { status: "data", data: 1 });
    expect(result.current.load).toEqual({ status: "data", data: 2, staleReason: null });
  });

  it("refetches when the first analysis arrives on a campaign that had none", async () => {
    const { fetcher, resolve } = deferredFetcher<string>();
    const { result, rerender } = renderHook(({ k }: { k: string | null }) => useLatestLoad(fetcher, k), { initialProps: { k: null as string | null } });
    await resolve(0, { status: "data", data: "no analysis" });
    rerender({ k: "none" }); // the analysis read settles: no analysis yet
    await resolve(1, { status: "data", data: "no analysis" });
    rerender({ k: "none" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    rerender({ k: '[1795116400,"abc"]' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await resolve(2, { status: "data", data: "evidence" });
    expect(result.current.load).toEqual({ status: "data", data: "evidence", staleReason: null });
  });

  it("refetches when the analysis becomes known after a read started without it", async () => {
    const { fetcher, resolve } = deferredFetcher<string>();
    const { result, rerender } = renderHook(({ k }: { k: string | null }) => useLatestLoad(fetcher, k), { initialProps: { k: null as string | null } });
    await resolve(0, { status: "data", data: "no analysis" });
    rerender({ k: '[1795116400,"abc"]' }); // the first analysis lands before the initial analysis read ever settled
    expect(fetcher).toHaveBeenCalledTimes(2);
    await resolve(1, { status: "data", data: "evidence" });
    expect(result.current.load).toEqual({ status: "data", data: "evidence", staleReason: null });
  });

  it("does not refetch when the key was already known at the first read", async () => {
    const { fetcher, resolve } = deferredFetcher<number>();
    const { rerender } = renderHook(({ k }: { k: string | null }) => useLatestLoad(fetcher, k), { initialProps: { k: "a1" as string | null } });
    await resolve(0, { status: "data", data: 1 });
    rerender({ k: null });
    rerender({ k: "a1" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("marks the data stale when a refresh fails, and clears it on a successful retry", async () => {
    const { fetcher, resolve } = deferredFetcher<number>();
    const { result, rerender } = renderHook(({ k }: { k: string | null }) => useLatestLoad(fetcher, k), { initialProps: { k: "a1" } });
    await resolve(0, { status: "data", data: 1 });
    rerender({ k: "a2" });
    await resolve(1, { status: "error", message: "The engine is unreachable." });
    expect(result.current.load).toEqual({ status: "data", data: 1, staleReason: "The engine is unreachable." });
    act(() => void result.current.reload());
    await resolve(2, { status: "data", data: 2 });
    await waitFor(() => expect(result.current.load).toEqual({ status: "data", data: 2, staleReason: null }));
  });

  it("reports an error when the first read fails", async () => {
    const { fetcher, resolve } = deferredFetcher<number>();
    const { result } = renderHook(() => useLatestLoad(fetcher, null));
    await resolve(0, { status: "error", message: "down" });
    expect(result.current.load).toEqual({ status: "error", message: "down" });
  });
});
