"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A one-off read with honest states, re-run whenever `key` changes. Unlike
 * the shared engine resources, `null` is a real answer here ("this engine has
 * no such route"), so it is data, not loading.
 */
export type AsyncState<T> =
  | { status: "loading"; reload: () => void }
  | { status: "error"; error: unknown; reload: () => void }
  | { status: "data"; data: T; reload: () => void };

export function useAsync<T>(fn: () => Promise<T>, key: string | null): AsyncState<T> {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; error: unknown } | { status: "data"; data: T }>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  // Only the newest request may write state.
  const ticket = useRef(0);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (key == null) return;
    const mine = ++ticket.current;
    fnRef.current().then(
      (data) => {
        if (mine === ticket.current) setState({ status: "data", data });
      },
      (error: unknown) => {
        if (mine === ticket.current) setState({ status: "error", error });
      },
    );
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
