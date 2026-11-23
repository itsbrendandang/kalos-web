import { useCallback, useEffect, useRef, useState } from "react";

export type Fetched<T> = { status: "error"; message: string } | { status: "data"; data: T };
/** `staleReason` is set when a refresh failed and the data shown is from an earlier read. */
export type LoadState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "data"; data: T; staleReason: string | null };

const invalidate = (epoch: { current: number }) => {
  epoch.current++;
};

/**
 * Loads `fetcher` on mount and again whenever `refreshKey` (null = not known yet)
 * differs from the key the newest request was made under, so data that is only
 * known after the first request started (e.g. the first analysis landing before
 * the initial analysis read settles) still triggers a refetch.
 *
 * Every request and every `update` takes a ticket. Data is shown only if it is
 * newer than the data already shown, so an older response landing late never
 * overwrites a newer one or a confirmed write;
 * a failure only counts when it comes from the newest request. A failure keeps the
 * newest good data (even from a superseded request) and marks it stale until
 * `reload` succeeds.
 */
export function useLatestLoad<T>(fetcher: () => Promise<Fetched<T>>, refreshKey: string | null) {
  const [load, setLoad] = useState<LoadState<T>>({ status: "loading" });
  const epoch = useRef(0);
  const issued = useRef(0);
  const shown = useRef(0);
  const failure = useRef<{ ticket: number; message: string } | null>(null);
  const currentKey = useRef(refreshKey);
  const requestedKey = useRef<string | null>(null);

  useEffect(() => {
    currentKey.current = refreshKey;
  }, [refreshKey]);

  const reload = useCallback(async () => {
    const mine = ++issued.current;
    const myEpoch = epoch.current;
    requestedKey.current = currentKey.current;
    const next = await fetcher();
    if (myEpoch !== epoch.current) return;
    if (next.status === "data") {
      if (mine < shown.current) return;
      shown.current = mine;
      const newerFailure = failure.current && failure.current.ticket > mine ? failure.current.message : null;
      setLoad({ status: "data", data: next.data, staleReason: newerFailure });
    } else {
      if (mine !== issued.current) return;
      failure.current = { ticket: mine, message: next.message };
      setLoad((prev) => (prev.status === "data" ? { ...prev, staleReason: next.message } : next));
    }
  }, [fetcher]);

  useEffect(() => {
    void reload();
    // Unmount or a new fetcher: whatever is still in flight must not write.
    return () => invalidate(epoch);
  }, [reload]);

  useEffect(() => {
    if (refreshKey != null && refreshKey !== requestedKey.current) void reload();
  }, [refreshKey, reload]);

  /**
   * Apply a response a write already returned to the data shown. It counts as a
   * read newer than every request in flight, so none of those can undo it.
   */
  const update = useCallback((f: (data: T) => T) => {
    shown.current = ++issued.current;
    setLoad((prev) => (prev.status === "data" ? { ...prev, data: f(prev.data) } : prev));
  }, []);

  return { load, reload, update };
}
