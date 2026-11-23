import { useCallback, useEffect, useRef, useState } from "react";
import { useOnKeyChange } from "@/hooks/use-on-key-change";

export type Fetched<T> = { status: "error"; message: string } | { status: "data"; data: T };
/** `staleReason` is set when a refresh failed and the data shown is from an earlier read. */
export type LoadState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "data"; data: T; staleReason: string | null };

const invalidate = (ticket: { current: number }) => {
  ticket.current++;
};

/**
 * Loads `fetcher` on mount and again whenever `refreshKey` changes (see useOnKeyChange).
 * Every request takes a ticket and only the newest may write, so an older response
 * landing late never overwrites a newer one. A failed refresh keeps the last data
 * and marks it stale until `reload` succeeds.
 */
export function useLatestLoad<T>(fetcher: () => Promise<Fetched<T>>, refreshKey: string | null) {
  const [load, setLoad] = useState<LoadState<T>>({ status: "loading" });
  const ticket = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++ticket.current;
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

  useOnKeyChange(refreshKey, reload);

  /** Apply a response a write already returned to the data shown. */
  const update = useCallback((f: (data: T) => T) => {
    setLoad((prev) => (prev.status === "data" ? { ...prev, data: f(prev.data) } : prev));
  }, []);

  return { load, reload, update };
}
