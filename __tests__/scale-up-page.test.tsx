// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ScaleUpPage from "@/app/campaigns/[id]/scale-up/page";
import { EngineDataProvider } from "@/hooks/use-engine";
import gatesJson from "./fixtures/scale-v2-gates.json";
import stagesJson from "./fixtures/scale-v2-stages.json";

/*
 * The Scale-up page with the real campaign provider; fetch is the only seam.
 * Gate evidence comes from GET /gates, computed from the campaign's analysis.
 */

const ID = "cmp_test";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const noAnalysisGates = {
  ...gatesJson,
  campaign_id: ID,
  gates: gatesJson.gates.map((g) => ({ ...g, computed_evidence: { available: false, basis: "computed", code: "no_analysis", reason: "the campaign has no analysis yet" } })),
};
const analysedGates = { ...gatesJson, campaign_id: ID };
const analysis = {
  has_data: true, dataset: "synthetic_bioprocess.csv", updated: 1795116328.8, timestamp: 1795116328, engine_version: "0.1.0", target: "titer_g_L",
  drivers: [], proposals: [], oof: [], features: [], proposal_provenance: { provenance_sha256: "abc" },
};
const detail = {
  campaign: { id: ID, name: "Test", created_by: null, created_at: 1, updated_at: 1, archived_at: null, archived: false, seeded: false, is_default: false },
  summary: { has_campaign: false },
};

let gatesCalls: number;
let analysisReady: Promise<void>;
let landAnalysis: () => void;
let analysisLanded: boolean;
/** The analysis read's reply once it lands. */
let analysisBody: unknown;
/** GET /gates answers 503 from this call on (1-based); null = never. */
let gatesFailFrom: number | null;
/** When set, the first GET /gates waits for it before answering. */
let holdFirstGates: Promise<void> | null;

beforeEach(() => {
  gatesCalls = 0;
  analysisLanded = false;
  analysisBody = analysis;
  gatesFailFrom = null;
  holdFirstGates = null;
  analysisReady = new Promise((r) => (landAnalysis = r));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/api/campaigns/${ID}`)) return json(detail);
      if (url.endsWith(`/api/campaigns/${ID}/analysis`)) {
        await analysisReady;
        return json(analysisBody);
      }
      if (url.endsWith(`/api/campaigns/${ID}/stages`)) return json({ ...stagesJson, campaign_id: ID });
      if (url.endsWith(`/api/campaigns/${ID}/gates`)) {
        const call = ++gatesCalls;
        if (call === 1 && holdFirstGates) await holdFirstGates;
        if (gatesFailFrom != null && call >= gatesFailFrom) return json({ error: "unavailable", code: "engine_unavailable" }, 503);
        return json(analysisLanded ? analysedGates : noAnalysisGates);
      }
      if (url.includes(`/api/campaigns/${ID}/jobs`)) return json({ jobs: [] });
      return json({ error: "not found", code: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Scale-up page", () => {
  it("refreshes gate evidence when the first analysis lands before the initial analysis read settles", async () => {
    render(
      <EngineDataProvider campaignId={ID}>
        <ScaleUpPage />
      </EngineDataProvider>,
    );
    // The gates are read while the campaign has no analysis and the analysis read is still pending.
    expect(await screen.findAllByText(/Not available: the campaign has no analysis yet/)).not.toHaveLength(0);
    expect(gatesCalls).toBe(1);

    // The upload finishes: the analysis exists now, and the pending analysis read returns it.
    await act(async () => {
      analysisLanded = true;
      landAnalysis();
    });

    await waitFor(() => expect(gatesCalls).toBe(2));
    expect(await screen.findByText("Measured rows")).toBeTruthy();
    expect(screen.queryByText(/Not available: the campaign has no analysis yet/)).toBeNull();
  });

  it("keeps the gates it read, with the stale warning, when the refetch after a cold no-analysis read fails", async () => {
    analysisBody = { has_data: false };
    gatesFailFrom = 2;
    let releaseFirstGates = () => {};
    holdFirstGates = new Promise((r) => (releaseFirstGates = r));
    render(
      <EngineDataProvider campaignId={ID}>
        <ScaleUpPage />
      </EngineDataProvider>,
    );
    await waitFor(() => expect(gatesCalls).toBe(1));

    // While the first gates read is in flight, the analysis read settles with no analysis;
    // that starts a second stages and gates read, which fails.
    await act(async () => landAnalysis());
    await waitFor(() => expect(gatesCalls).toBe(2));

    // Then the first gates read answers.
    await act(async () => releaseFirstGates());
    expect(await screen.findByText("These gates may be out of date")).toBeTruthy();
    expect(screen.getAllByText(/Not available: the campaign has no analysis yet/)).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
