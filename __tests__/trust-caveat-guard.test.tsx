// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import campaignFixture from "./fixtures/plan-campaign.json";
import v2 from "./fixtures/predict-v2-analysis.json";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import PredictPage from "@/app/campaigns/[id]/predict/page";
import { BatchSection } from "@/components/report/report-summary";
import { BatchIntervalStrip } from "@/components/viz/charts/batch-interval-strip";
import { EngineDataProvider } from "@/hooks/use-engine";
import type { AnalyzeResult } from "@/lib/api";
import { PROPOSAL_INTERVAL_CAVEAT, methodCaveat, proposalCaveat, withoutCaveats } from "@/lib/proposal-caveat";
import { buildPackage, proposalsCsv, type PackageAnalysis } from "@/lib/report-package";
import { toBatchStripModel, type BatchStripModel } from "@/lib/viz-data/batch-interval-strip";

/*
 * GUARD (REDESIGN_DIRECTION, "PRIORITY: trust layer"): every interval on a
 * PROPOSAL shows the trust caveat, and nothing next to a proposal says
 * "calibrated" outside that caveat. The engine's own caveat fields
 * (kalos-engine#166 and later: intervals[].caveat, coverage_basis /
 * interval_basis, coverage_at_proposals_estimate, conformal_caveat) replace
 * the fixed text when present. These tests fail if a surface that draws a
 * proposal interval drops the caveat, or brings back "Calibrated on ...".
 */

type Analysis = typeof v2 & Record<string, unknown>;

// The engine's caveat text, verbatim, as kalos-engine sends it once the coverage
// evidence is rerun on main (kalos-engine fix/claims-match-main,
// kalos/portal/analysis_parts/coverage_evidence.py): the plain band's caveat
// (coverage_basis held_out_past_runs) and the selection-aware band's.
const ENGINE_MSG_90 =
  "Based on held-out runs similar to past runs. Proposals are chosen for high predicted values, so coverage at proposed recipes is lower: in simulation this 90% range covered only 54-83%.";
const ENGINE_MSG_95 =
  "Based on held-out runs similar to past runs. Proposals are chosen for high predicted values, so coverage at proposed recipes is lower: in simulation this 95% range covered only 64-91%.";
const ENGINE_SEL_MSG_90 =
  "Based on held-out runs: this 90% range was sized on the held-out past runs the model ranked highest, to mimic how proposals are chosen. At proposed recipes this 90% range covered 86-99% in simulation, below 90% in some cases (measured, not guaranteed).";
const estimate = (nominal: number, min: number, max: number) => ({ nominal, measured_min: min, measured_max: max, basis: "simulation", source: `interval_method.coverage_at_proposals.${nominal}`, benchmark: "python -m kalos.bench.coverage_at_proposals" });
const CONFORMAL_MSG =
  "The +/- conformal_q band's coverage was measured on held-out past runs. It is not guaranteed for proposals, especially those far from the data or at the box edge. Proposals are chosen for high predicted values, so coverage at proposed recipes is lower: in simulation this 90% range covered only 66-87%.";

/** v2 with the engine's per-interval caveat and basis on every proposal interval. */
function withEngineCaveat(): Analysis {
  const a = structuredClone(v2) as Analysis;
  for (const p of a.proposals) {
    p.intervals = p.intervals.map((i) => ({
      ...i,
      coverage_basis: "held_out_past_runs",
      caveat: {
        code: "coverage_lower_at_proposals",
        message: i.coverage === 0.9 ? ENGINE_MSG_90 : ENGINE_MSG_95,
        coverage_at_proposals_estimate: i.coverage === 0.9 ? estimate(0.9, 0.545, 0.835) : estimate(0.95, 0.645, 0.915),
      },
    })) as never;
  }
  return a;
}

/** v2 as an older analysis: only the global conformal_q band. */
function globalOnly(conformalCaveat = false): Analysis {
  const a = structuredClone(v2) as Analysis;
  delete (a as Record<string, unknown>).interval_levels;
  delete (a as Record<string, unknown>).interval_method;
  for (const p of a.proposals) {
    delete (p as Record<string, unknown>).intervals;
    delete (p as Record<string, unknown>).gp_intervals;
  }
  if (conformalCaveat)
    (a as Record<string, unknown>).conformal_caveat = {
      code: "coverage_not_guaranteed",
      caveat_code: "coverage_lower_at_proposals",
      coverage_basis: "held_out_past_runs",
      message: CONFORMAL_MSG,
      coverage_at_proposals_estimate: estimate(0.9, 0.66, 0.87),
    };
  return a;
}

const VARIANTS: { name: string; make: () => Analysis; caveat: string; basis: string | null }[] = [
  { name: "per-proposal bands, older engine (fixed text)", make: () => structuredClone(v2) as Analysis, caveat: PROPOSAL_INTERVAL_CAVEAT, basis: null },
  { name: "per-proposal bands with the engine's caveat", make: withEngineCaveat, caveat: ENGINE_MSG_90, basis: "held-out runs similar to past runs" },
  { name: "global band only, older engine (fixed text)", make: () => globalOnly(false), caveat: PROPOSAL_INTERVAL_CAVEAT, basis: null },
  { name: "global band with the engine's conformal_caveat", make: () => globalOnly(true), caveat: CONFORMAL_MSG, basis: "held-out runs similar to past runs" },
];

/** Every caveat sentence any variant can show, for the "calibrat... only inside a caveat" check. */
const ALL_CAVEATS = [PROPOSAL_INTERVAL_CAVEAT, ENGINE_MSG_90, ENGINE_MSG_95, ENGINE_SEL_MSG_90, CONFORMAL_MSG];

/** A proposal interval as printed: "[1.60, 1.91]". */
const INTERVAL = /\[\u2212?\d[\d.]*, \u2212?\d[\d.]*\]/;

function assertGuard(text: string, caveat: string) {
  if (INTERVAL.test(text)) expect(text, "a proposal interval rendered without its trust caveat").toContain(caveat);
  expect(withoutCaveats(text, ALL_CAVEATS), "'calibrated' next to a proposal outside the trust caveat").not.toMatch(/calibrat/i);
}

describe("lib/proposal-caveat", () => {
  it("uses the engine's message, basis and estimate when sent", () => {
    const c = proposalCaveat({ coverage_basis: "held_out_past_runs", caveat: { code: "coverage_lower_at_proposals", message: ENGINE_MSG_90, coverage_at_proposals_estimate: estimate(0.9, 0.545, 0.835) } });
    expect(c).toMatchObject({ text: ENGINE_MSG_90, from: "engine", basis: "held_out_past_runs", basisText: "held-out runs similar to past runs", estimateText: "measured 54-83% at proposals in simulation, nominal 90%" });
  });
  it("renders the selection-aware band's engine caveat verbatim, including 'below 90% in some cases'", () => {
    const c = proposalCaveat({ coverage_basis: "held_out_top_ranked_runs", caveat: { code: "coverage_lower_at_proposals", message: ENGINE_SEL_MSG_90, coverage_at_proposals_estimate: estimate(0.9, 0.86, 0.99) } });
    expect(c).toMatchObject({ text: ENGINE_SEL_MSG_90, from: "engine", basisText: "the held-out past runs the model ranked highest", estimateText: "measured 86-99% at proposals in simulation, nominal 90%" });
    expect(c.text).not.toMatch(/calibrat/i);
  });
  it("prefers interval_basis over coverage_basis, and builds a sentence from an estimate without a message (no 'calibrated')", () => {
    const c = proposalCaveat({ interval_basis: "held_out_top_ranked_runs", coverage_basis: "held_out_past_runs", coverage_at_proposals_estimate: estimate(0.9, 0.86, 0.995) });
    expect(c.basis).toBe("held_out_top_ranked_runs");
    expect(c.text).toBe(
      "This 90% band's coverage was measured on the held-out past runs the model ranked highest, not at proposals. At proposed recipes it measured 86-99% at proposals in simulation, nominal 90%. Not a guarantee.",
    );
    expect(c.text).not.toMatch(/calibrat/i);
  });
  it("falls back to interval_method.coverage_at_proposals, then to the fixed text", () => {
    const method = { coverage_at_proposals: { "0.9": { message: ENGINE_MSG_90, coverage_at_proposals_estimate: estimate(0.9, 0.545, 0.835) } } };
    expect(proposalCaveat({}, methodCaveat(method, 0.9), 0.9).text).toBe(ENGINE_MSG_90);
    expect(methodCaveat(method, 0.95)).toBeNull();
    expect(proposalCaveat(null)).toMatchObject({ text: PROPOSAL_INTERVAL_CAVEAT, from: "static", basis: null, estimate: null });
  });
  it("the fixed text (engines that send no caveat) claims no number and never says 'calibrated'", () => {
    expect(PROPOSAL_INTERVAL_CAVEAT).not.toMatch(/calibrat/i);
    expect(PROPOSAL_INTERVAL_CAVEAT).not.toMatch(/\d/);
    expect(PROPOSAL_INTERVAL_CAVEAT).toMatch(/unknown for this engine version/);
  });
});

describe("guard: the batch strip model and chart", () => {
  for (const v of VARIANTS) {
    it(`every row with a band carries the caveat: ${v.name}`, () => {
      const a = v.make() as unknown as AnalyzeResult;
      const m: BatchStripModel = toBatchStripModel(a, { target: "titer", unit: "g/L" });
      expect(m.rows.length).toBeGreaterThan(0);
      for (const r of m.rows) if (r.interval.kind === "value") expect(r.caveat?.text).toBe(v.caveat);
      expect(m.caveat?.text).toBe(v.caveat);
      if (v.basis) expect(m.caveat?.basisText).toBe(v.basis);
      render(<BatchIntervalStrip model={m} width={1000} />);
      const text = document.body.textContent ?? "";
      expect(text).toContain(v.caveat);
      if (v.basis) expect(text).toContain(`Interval basis: ${v.basis}`);
      assertGuard(text, v.caveat);
      // The Data table and the description carry it too.
      expect(screen.getByRole("group", { name: /Proposed batch/ }).getAttribute("aria-label")).toContain(v.caveat);
      cleanup();
    });
  }

  it("a refused level draws no band and so no caveat", () => {
    const a = structuredClone(v2) as Analysis;
    a.proposals.forEach((p) => (p.intervals[1] = { coverage: 0.95, method: "conformal_normalized", available: false, lo: null, hi: null, reason: "too few" } as never));
    const m = toBatchStripModel(a as unknown as AnalyzeResult, { target: "titer", unit: "g/L", coverage: 0.95 });
    expect(m.rows.every((r) => r.caveat == null)).toBe(true);
    expect(m.caveat).toBeNull();
  });
});

// --- The Predict page: strip, table, cards, details, comparison, start dialog ---

const ID = "cmp_test";
const BASE = `/api/engine/api/campaigns/${ID}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const meta = { id: ID, name: "Test campaign", created_by: "t", created_at: 1, updated_at: 1, archived_at: null, archived: false, seeded: true, is_default: false };
let analysis: unknown;

describe("guard: the Predict page's proposed experiments", () => {
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

  for (const v of VARIANTS) {
    it(`shows the caveat with every proposal interval and never 'calibrated' outside it: ${v.name}`, async () => {
      analysis = v.make();
      render(
        <EngineDataProvider campaignId={ID}>
          <PredictPage />
        </EngineDataProvider>,
      );
      await screen.findByRole("heading", { level: 1, name: /^Predict/ });
      const batch = document.getElementById("predict-batch") as HTMLElement;
      // Open P1's details and compare P1 with P2, so every proposal surface is on the page.
      fireEvent.click(within(batch).getAllByRole("button", { name: /P1 ?details/ })[0]);
      fireEvent.click(within(batch).getAllByRole("button", { name: /^Compare ?P1$/ })[0]);
      fireEvent.click(within(batch).getAllByRole("button", { name: /^Compare ?P2$/ })[0]);
      // And every disclosure in the section (the per-recipe band's method among them).
      for (const d of batch.querySelectorAll("details")) {
        d.open = true;
        fireEvent(d, new Event("toggle"));
      }
      const text = batch.textContent ?? "";
      expect(text).toMatch(INTERVAL);
      if (v.name.startsWith("per-proposal")) expect(text).toContain("held-out scores");
      assertGuard(text, v.caveat);
      // Table (wide), cards (narrow), the details and the comparison each show it.
      const table = within(batch).getAllByRole("table").find((t) => /Model-generated proposals/.test(t.textContent ?? "")) as HTMLElement;
      expect(table.parentElement?.textContent).toContain(v.caveat);
      for (const details of within(batch).getAllByRole("region", { name: /Prediction for P1/ })) expect(details.textContent).toContain(v.caveat);
      expect(within(batch).getByRole("region", { name: /^Compare P1, P2/ }).textContent).toContain(v.caveat);
      expect(text.split(v.caveat).length - 1, "strip, table, cards, details, comparison").toBeGreaterThanOrEqual(5);
      // Never the old per-proposal claim.
      expect(text).not.toMatch(/Calibrated on \d/);
      // The start dialog lists predictions with their bands: the caveat goes with them.
      fireEvent.click(screen.getAllByRole("button", { name: /^Review and start/ })[0]);
      const dialog = await screen.findByRole("dialog");
      assertGuard(dialog.textContent ?? "", v.caveat);
      expect(dialog.textContent).toContain(v.caveat);
    });
  }
});

// --- The data package and the Report's batch -----------------------------------

describe("guard: the data package and the Report's batch section", () => {
  const pkgMeta = { id: ID, name: "Test", created_by: "t", created_at: 1, updated_at: 1, archived_at: null, archived: false, seeded: true, is_default: false };
  afterEach(cleanup);

  for (const v of VARIANTS) {
    it(`every proposal interval in the package carries the caveat: ${v.name}`, () => {
      const a = v.make() as unknown as PackageAnalysis;
      const pkg = buildPackage(pkgMeta, null, a, 0);
      for (const p of pkg.proposals) {
        const levels = p.predicted.intervals.filter((i) => i.available);
        for (const i of levels) {
          const c = p.predicted.interval_caveats.find((x) => x.applies_to === "per_proposal_interval" && x.coverage === i.coverage);
          expect(c?.text, `P${p.index} at ${i.coverage}`).toBeTruthy();
          if (v.basis) expect(c?.interval_basis).toBe("held_out_past_runs");
        }
        if (p.predicted.band_half_width != null) expect(p.predicted.interval_caveats.some((x) => x.applies_to === "global_band")).toBe(true);
        expect(p.predicted.interval_caveats.map((x) => x.text)).toContain(v.caveat);
      }
      const csv = proposalsCsv(pkg);
      const head = csv.split("\r\n")[0].split(",");
      for (const col of head.filter((h) => /^interval_\d+(_\d+)?_lo$/.test(h))) expect(head).toContain(col.replace(/_lo$/, "_caveat"));
      expect(head).toContain("predicted_band_caveat");
      expect(csv).toContain(v.caveat.includes(",") ? `"${v.caveat}"` : v.caveat);
      render(<BatchSection pkg={pkg} />);
      const text = document.body.textContent ?? "";
      expect(text).toMatch(INTERVAL);
      assertGuard(text, v.caveat);
    });
  }
});
