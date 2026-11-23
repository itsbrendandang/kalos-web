import { describe, expect, it } from "vitest";
import { analysisRefreshKey } from "@/lib/viz-data/stage-gate";

describe("analysisRefreshKey", () => {
  it("is null only while the analysis is loading", () => {
    expect(analysisRefreshKey(null)).toBeNull();
    expect(analysisRefreshKey({ has_data: false })).toBe("none");
  });

  it("changes when a hashless analysis is replaced", () => {
    const a = analysisRefreshKey({ has_data: true, updated: 1 });
    const b = analysisRefreshKey({ has_data: true, updated: 2 });
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
  });

  it("includes the provenance hash", () => {
    const base = { has_data: true, updated: 1 };
    expect(analysisRefreshKey({ ...base, proposal_provenance: { provenance_sha256: "x" } })).not.toBe(
      analysisRefreshKey({ ...base, proposal_provenance: { provenance_sha256: "y" } }),
    );
  });
});
