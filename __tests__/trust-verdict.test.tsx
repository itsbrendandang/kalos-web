// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import campaignFixture from "./fixtures/plan-campaign.json";
import v2 from "./fixtures/predict-v2-analysis.json";
import exploration from "./fixtures/trust-v2-exploration-batch.json";
import notJudged from "./fixtures/trust-v2-not-judged.json";
import refused from "./fixtures/trust-v2-refused.json";
import roundsNotYet from "./fixtures/trust-v2-rounds-not-yet.json";
import trusted from "./fixtures/trust-v2-trusted.json";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import PredictPage from "@/app/campaigns/[id]/predict/page";
import { BatchSection, ModelSection } from "@/components/report/report-summary";
import { EngineDataProvider } from "@/hooks/use-engine";
import { cvGroupingText, isReliable, reliabilityReason, reliabilityVerdict, type AnalyzeResult } from "@/lib/api";
import { PROPOSAL_INTERVAL_CAVEAT, proposalCaveat } from "@/lib/proposal-caveat";
import { EXPLORATION_LABEL, batchTrustOf, modelRefusalOf, proposalTrustOf } from "@/lib/proposal-trust";
import { buildPackage, proposalsCsv, type PackageAnalysis } from "@/lib/report-package";
import { toBatchStripModel } from "@/lib/viz-data/batch-interval-strip";
import { BatchIntervalStrip } from "@/components/viz/charts/batch-interval-strip";

/*
 * The engine's trust layer (feat/trust-calibration; fixtures are real `_analyze`
 * responses: four sheets from its tests/fixtures/trust_golden.json, plus a
 * 10-run sheet (not judged) and a 2-recipe sheet (refused) run on that branch).
 * Every field is optional: the older v2 fixture renders as before.
 */

const A = (x: unknown) => x as unknown as AnalyzeResult;

describe("(1) reliability not judged below 12 runs: never a pass or a fail", () => {
  it("reads clears_floor null / verdict not_judged as 'Not judged: too few runs'", () => {
    const v = reliabilityVerdict(A(notJudged));
    expect(v.state).toBe("not-judged");
    expect(v.label).toBe("Not judged: too few runs");
    expect(v.reason).toContain("10 runs; the trust floor is judged from 12");
    expect(v.reason).not.toMatch(/below the trust floor|clears|above the trust floor/i);
    expect(isReliable(A(notJudged))).toBe(false);
    expect(reliabilityReason(A(notJudged))).toBe("Not judged: too few runs");
    // A bare null (no `verdict` field) reads the same.
    const bare = { ...A(notJudged), reliability: { ...A(notJudged).reliability!, verdict: undefined } };
    expect(reliabilityVerdict(bare).state).toBe("not-judged");
  });

  it("never says Reliable while the engine's verdict is not_yet (clears the floor with < 20 runs)", () => {
    expect(A(roundsNotYet).reliability?.clears_floor).toBe(true);
    const v = reliabilityVerdict(A(roundsNotYet));
    expect(v.state).toBe("not-yet");
    expect(v.reason).toBe(A(roundsNotYet).verdict!.headline);
  });

  it("keeps the older analyses' verdict", () => {
    expect(reliabilityVerdict(A(v2)).state).toBe("reliable");
    expect(reliabilityVerdict(A(trusted)).state).toBe("reliable");
  });

  it("the Report says not judged, not yes/no", () => {
    render(<ModelSection pkg={buildPackage(meta, null, notJudged as unknown as PackageAnalysis, 0)} />);
    for (const d of document.querySelectorAll("details")) {
      d.open = true;
      fireEvent(d, new Event("toggle"));
    }
    const text = document.body.textContent ?? "";
    expect(text).toContain("Not judged: too few runs.");
    expect(text).toContain("Clears floor: not judged: too few runs (10 runs; the trust floor is judged from 12)");
    expect(text).not.toMatch(/Clears floor: (yes|no)\b/);
  });
});

describe("(2) each proposal's trust label", () => {
  it("labels exploration proposals 'exploration: model not trusted yet' and trusted ones model-guided", () => {
    const m = toBatchStripModel(A(exploration), { target: "titer", unit: null });
    expect(m.rows.length).toBe(5);
    for (const r of m.rows) expect(r.trust).toMatchObject({ kind: "exploration", label: EXPLORATION_LABEL });
    expect(batchTrustOf(A(exploration))?.message).toMatch(/^Exploration, not a recommendation/);
    for (const r of toBatchStripModel(A(trusted), { target: "t", unit: null }).rows) expect(r.trust).toMatchObject({ kind: "model-guided", label: "model-guided" });
    // A bare status string, and the "model_guided" spelling.
    expect(proposalTrustOf({ trust: "model_guided" })?.kind).toBe("model-guided");
    expect(proposalTrustOf({ trust: "exploration_untrusted" })?.label).toBe(EXPLORATION_LABEL);
    // Mixed per-proposal labels: no batch-level label (callers say "every proposal is ..."), each row keeps its own.
    const mixed = A({ ...A(exploration), proposals: A(exploration).proposals.map((p, i) => (i === 0 ? { ...p, trust: "trusted" } : p)) });
    expect(batchTrustOf(mixed)).toBeNull();
    expect(toBatchStripModel(mixed, { target: "t", unit: null }).rows.map((r) => r.trust?.kind)).toEqual(["model-guided", "exploration", "exploration", "exploration", "exploration"]);
    // Older analyses: no label at all.
    expect(toBatchStripModel(A(v2), { target: "t", unit: null }).rows.every((r) => r.trust == null)).toBe(true);
  });

  it("the strip names it in each row's tooltip and for screen readers", () => {
    const m = toBatchStripModel(A(exploration), { target: "titer", unit: null });
    render(<BatchIntervalStrip model={m} width={1000} warning={`Every proposal is ${EXPLORATION_LABEL}.`} />);
    expect(screen.getAllByText(`, ${EXPLORATION_LABEL}`)).toHaveLength(5);
    fireEvent.focus(screen.getAllByRole("button", { name: /^P1/ })[0]);
    expect(within(screen.getByRole("tooltip")).getByText(EXPLORATION_LABEL)).toBeTruthy();
    cleanup();
  });

  it("the data package and the batch CSV carry it", () => {
    const pkg = buildPackage(meta, null, exploration as unknown as PackageAnalysis, 0);
    expect(pkg.proposals.every((p) => p.trust?.label === EXPLORATION_LABEL)).toBe(true);
    expect(pkg.model.proposal_trust?.status).toBe("exploration_untrusted");
    expect(proposalsCsv(pkg).split("\r\n")[1]).toContain(`,${EXPLORATION_LABEL},`);
    render(<BatchSection pkg={pkg} />);
    expect(screen.getAllByText(EXPLORATION_LABEL)).toHaveLength(5);
  });
});

describe("(3) a refused verdict: no proposals, and the reason", () => {
  it("reads the engine's refusal", () => {
    const r = modelRefusalOf(A(refused))!;
    expect(r.reasons[0]).toBe("Kalos cannot suggest recipes from this sheet: there are too few groups of runs to check whether the model is any good.");
    expect(r.reasons).toContain("The sheet has 2 groups of runs; Kalos needs at least 3 to check the model.");
    expect(r.fix).toBe("Add measured runs of at least 8 different recipes, then upload the sheet again.");
    expect(r.code).toBe("insufficient");
    expect(modelRefusalOf(A(exploration))).toBeNull();
    expect(modelRefusalOf(A(v2))).toBeNull();
  });

  it("the Report's batch section says why it is empty", () => {
    render(<BatchSection pkg={buildPackage(meta, null, refused as unknown as PackageAnalysis, 0)} />);
    expect(screen.getByText(/The engine withheld the batch/)).toBeTruthy();
    expect(screen.getByText(/What would help: Add measured runs of at least 8 different recipes/)).toBeTruthy();
    expect(screen.getByText("The sheet has 2 groups of runs; Kalos needs at least 3 to check the model.")).toBeTruthy();
  });

  it("the Report explains a withheld batch from the verdict alone (no refusal object)", () => {
    cleanup();
    const withheldOnly = { ...(refused as object), refusal: null } as unknown as PackageAnalysis;
    render(<BatchSection pkg={buildPackage(meta, null, withheldOnly, 0)} />);
    expect(screen.getByText(/The engine withheld the batch/)).toBeTruthy();
    expect(screen.getByText(A(refused).verdict!.headline!)).toBeTruthy();
    expect(screen.queryByText("The current analysis has no proposed batch.")).toBeNull();
  });
});

describe("(4) the engine's coverage basis and coverage-at-proposals estimate replace the fixed caveat", () => {
  it("uses the engine's caveat, basis and source on every band", () => {
    const m = toBatchStripModel(A(notJudged), { target: "titer", unit: null });
    expect(m.caveat?.from).toBe("engine");
    expect(m.caveat?.text).toMatch(/^This 90% range is calibrated on the held-out past runs the model ranked highest/);
    expect(m.caveat?.text).not.toBe(PROPOSAL_INTERVAL_CAVEAT);
    expect(m.caveat?.basisText).toBe("the held-out past runs the model ranked highest");
    expect(m.caveat?.estimateText).toBe("measured 92-99% at proposals in simulation, nominal 90%");
    expect(m.caveat?.estimateSource).toBe("python -m kalos.bench.coverage_at_proposals (interval_method.coverage_at_proposals.0.9)");
    // The GP band's model-based basis and estimate.
    const gp = A(notJudged).proposals[0].gp_intervals![0];
    expect(proposalCaveat({ coverage_basis: gp.coverage_basis, coverage_at_proposals_estimate: gp.coverage_at_proposals_estimate }).estimateText).toBe(
      "measured 50-72% at proposals in simulation, nominal 90%",
    );
  });
});

describe("(5) which grouping drove the held-out score", () => {
  it("names it in plain words", () => {
    expect(cvGroupingText(A(exploration).cv_grouping)).toBe("held-out by batch (5 groups), replicates kept together");
    expect(cvGroupingText(A(roundsNotYet).cv_grouping)).toBe("held-out by campaign round (4 groups), replicates kept together");
    expect(cvGroupingText(A(trusted).cv_grouping)).toBe("held-out by replicate group (21 groups)");
    expect(cvGroupingText(A(v2).cv_grouping)).toBeNull();
  });
});

// --- The Predict page on each ------------------------------------------------

const ID = "cmp_test";
const BASE = `/api/engine/api/campaigns/${ID}`;
const meta = { id: ID, name: "Test campaign", created_by: "t", created_at: 1, updated_at: 1, archived_at: null, archived: false, seeded: true, is_default: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let analysis: unknown;

async function renderPredict(a: unknown) {
  analysis = a;
  render(
    <EngineDataProvider campaignId={ID}>
      <PredictPage />
    </EngineDataProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: /^Predict/ });
}

describe("the Predict page", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === BASE && method === "GET") return json({ campaign: meta, summary: campaignFixture });
        if (url === `${BASE}/analysis`) return json(analysis);
        if (url.startsWith(`${BASE}/jobs`) && method === "GET") return json({ jobs: [] });
        throw new Error(`unexpected fetch ${method} ${url}`);
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("not judged: the verdict says so, and no pass or fail", async () => {
    await renderPredict(notJudged);
    const trust = screen.getByRole("region", { name: "Can the model be trusted?" });
    expect(within(trust).getByText("Not judged: too few runs")).toBeTruthy();
    expect(within(trust).queryByText("Reliable")).toBeNull();
    expect(within(trust).queryByText("Not yet reliable")).toBeNull();
    expect(screen.getByText(/^Not judged: too few runs to check the model/)).toBeTruthy();
  });

  it("exploration: every proposal carries the label, and the grouping sits next to the score", async () => {
    await renderPredict(exploration);
    const batch = document.getElementById("predict-batch") as HTMLElement;
    const table = within(batch).getAllByRole("table").find((t) => /Model-generated proposals/.test(t.textContent ?? "")) as HTMLElement;
    expect(within(table).getAllByText(EXPLORATION_LABEL)).toHaveLength(5);
    // The strip's banner (the chart only draws once it has a width, so it is checked on its own below).
    const trust = screen.getByRole("region", { name: "Can the model be trusted?" });
    expect(within(trust).getByText("held-out by batch (5 groups), replicates kept together")).toBeTruthy();
    expect(within(trust).getAllByText(/Model, held-out by batch/).length).toBeGreaterThan(0);
  });

  it("trusted: proposals read model-guided, no exploration label", async () => {
    await renderPredict(trusted);
    const batch = document.getElementById("predict-batch") as HTMLElement;
    expect(batch.textContent).not.toContain(EXPLORATION_LABEL);
    expect(within(batch).getAllByText("model-guided").length).toBeGreaterThanOrEqual(5);
  });

  it("refused: no batch, the engine's reason and what would help", async () => {
    await renderPredict(refused);
    expect(screen.getByText(/^No proposals this round: Kalos cannot suggest recipes from this sheet/)).toBeTruthy();
    const batch = document.getElementById("predict-batch") as HTMLElement;
    expect(within(batch).getByText("No proposals: the engine withheld the batch because the model cannot be trusted yet")).toBeTruthy();
    expect(batch.textContent).toContain("The sheet has 2 groups of runs; Kalos needs at least 3 to check the model.");
    expect(batch.textContent).toContain("Add measured runs of at least 8 different recipes, then upload the sheet again.");
    expect(within(batch).queryByText("The engine proposed no experiments")).toBeNull();
    // A refusal is neutral, never a warning (VIZ_SPEC 2.6), and the raw code sits one click down.
    const headline = screen.getByText(/^No proposals this round/).closest("div")!;
    expect(headline.querySelector("svg.text-warn, svg.text-bad")).toBeNull();
    expect(within(batch).getByText("Engine details")).toBeTruthy();
    expect(batch.textContent).not.toContain("(insufficient)");
  });

  it("older analyses render without any of it", async () => {
    await renderPredict(v2);
    expect(document.body.textContent).not.toContain(EXPLORATION_LABEL);
    expect(document.body.textContent).not.toContain("held-out by");
    expect(document.body.textContent).not.toContain("Not judged: too few runs");
  });
});
