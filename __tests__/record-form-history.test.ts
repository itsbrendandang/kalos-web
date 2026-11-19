// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readCorrectionRows } from "@/components/campaign/record-form";

const ID = "cmp_test";
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const item = (id: number, run_id: string, version: number) => ({ id, run_id, version, value: version, previous_value: version - 1, reason: `v${version}`, actor: "a", recorded_at: 1, is_correction: version > 1 });

afterEach(() => vi.unstubAllGlobals());

describe("readCorrectionRows (record form): pages the result history", () => {
  it("follows next_before_id until every corrected run is reached at its version", async () => {
    const pages: Record<string, unknown> = {
      "": { results: { items: [item(9, "a", 3), item(8, "x", 1)], has_more: true, next_before_id: 8 } },
      "8": { results: { items: [item(5, "b", 2)], has_more: true, next_before_id: 5 } },
      "5": { results: { items: [item(1, "c", 1)], has_more: false, next_before_id: null } },
    };
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        return json(pages[new URL(url, "http://x").searchParams.get("results_before_id") ?? ""]);
      }),
    );
    const rows = await readCorrectionRows(ID, "a:3,b:2");
    expect(rows.get("a")?.reason).toBe("v3");
    expect(rows.get("b")?.reason).toBe("v2");
    // b was on the second page; the third was not needed.
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("results_before_id=8");
  });

  it("stops at the last page and leaves an unreached run without a row (never guessed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ results: { items: [item(2, "a", 2)], has_more: false, next_before_id: null } })),
    );
    const rows = await readCorrectionRows(ID, "a:2,z:4");
    expect(rows.get("a")?.version).toBe(2);
    expect(rows.has("z")).toBe(false);
  });
});
