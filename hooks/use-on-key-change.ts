import { useEffect, useRef } from "react";

/**
 * Calls `onChange` when `key` changes from one non-null value to another, e.g. when a
 * background re-analysis replaces the campaign's analysis. The first value seen, and
 * null (not loaded yet), never trigger it.
 */
export function useOnKeyChange(key: string | null, onChange: () => void): void {
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (key == null) return;
    const prev = seen.current;
    seen.current = key;
    if (prev != null && prev !== key) onChange();
  }, [key, onChange]);
}
