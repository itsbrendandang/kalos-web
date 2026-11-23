import { useCallback, useEffect, useRef, useState } from "react";

export type Fetched<T> = { status: "error"; message: string } | { status: "data"; data: T };
/** `staleReason` is set when a refresh failed and the data shown is from an earlier read. */
export type LoadState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "data"; data: T; staleReason: string | null };

const invalidate = (ticket: { current: number }) => {
  ticket.current++;
};

/**
 * Loads `fetcher` on mount and again whenever `refreshKey` (null = not known yet)
 * differs from the key the newest request was made under, so data that is only
 * known after the first request started (e.g. the first analysis landing before
 * the initial analysis read settles) still triggers a refetch. Every request takes
 * a ticket and only the newest may write, so an older response landing late never
 * overwrites a newer one. A failed refresh keeps the last data and marks it stale
 * until `reload` succeeds.
 */
export function useLatestLoad<T>(fetcher: () => Promise<Fetched<T>>, refreshKey: string | null) {
  const [load, setLoad] = useState<LoadState<T>>({ status: "loading" });
  const ticket = useRef(0);
  const currentKey = useRef(refreshKey);
  const requestedKey = useRef<string | null>(null);

  useEffect(() => {
    currentKey.current = refreshKey;
  }, [refreshKey]);

  const reload = useCallback(async () => {
    const mine = ++ticket.current;
    requestedKey.current = currentKey.current;
    const next = await fetcher();
    if (mine !== ticket.current) return;
    setLoad((prev) =>
      next.status === "data" ? { ...next, staleReason: null } : prev.status === "data" ? { ...prev, staleReason: next.message } : next,
    );
  }, [fetcher]);

  useEffect(() => {
    void reload();
    // Unmount or a new fetcher: whatever is still in flight must not write.
    return () => invalidate(ticket);
  }, [reload]);

  useEffect(() => {
    if (refreshKey != null && refreshKey !== requestedKey.current) void reload();
  }, [refreshKey, reload]);

  /** Apply a response a write already returned to the data shown. */
  const update = useCallback((f: (data: T) => T) => {
    setLoad((prev) => (prev.status === "data" ? { ...prev, data: f(prev.data) } : prev));
  }, []);

  return { load, reload, update };
}
