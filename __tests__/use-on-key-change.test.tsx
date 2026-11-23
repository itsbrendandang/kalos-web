// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useOnKeyChange } from "@/hooks/use-on-key-change";

describe("useOnKeyChange", () => {
  it("fires only when a loaded key changes to a different value", () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(({ k }: { k: string | null }) => useOnKeyChange(k, onChange), { initialProps: { k: null as string | null } });
    rerender({ k: "analysis-1" });
    rerender({ k: "analysis-1" });
    expect(onChange).not.toHaveBeenCalled();
    rerender({ k: null });
    rerender({ k: "analysis-1" });
    expect(onChange).not.toHaveBeenCalled();
    rerender({ k: "analysis-2" });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
