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
import { ResponseSurface2D } from "@/components/campaign/plan/response-surface";
import { EngineDataProvider } from "@/hooks/use-engine";

/*
 * The Predict page on a real engine v2 analysis (fixtures/predict-v2-analysis.json,
 * captured live): the per-proposal band with its coverage choice, a refused
 * level, the model-based chance to beat the incumbent, the distance to the
 * nearest measured run, the engine's target unit, the 1D slices, the sigma
 * panel and a setup refusal. fetch is the only seam.
 */

const ID = "cmp_test";
const BASE = `/api/engine/api/campaigns/${ID}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const meta = { id: ID, name: "Test campaign", created_by: "t", created_at: 1, updated_at: 1, archived_at: null, archived: false, seeded: true, is_default: false };

type Analysis = typeof v2 & Record<string, unknown>;
let analysis: unknown;

beforeEach(() => {
  analysis = v2;
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

async function renderPredict() {
  render(
    <EngineDataProvider campaignId={ID}>
      <PredictPage />
    </EngineDataProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: /^Predict/ });
}

const batchTable = () => screen.getAllByRole("table").find((t) => /Model-generated proposals/.test(t.textContent ?? "")) as HTMLElement;

function openDisclosure(summary: string) {
  const details = screen.getByText(summary).closest("details") as HTMLDetailsElement;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  return details;
}

describe("Predict on a v2 analysis: per-proposal bands", () => {
  it("offers the engine's coverage levels, defaulting to the first, and every band follows the choice", async () => {
    await renderPredict();
    const group = screen.getByRole("group", { name: "Band coverage" });
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.closest("label")?.textContent)).toEqual(["90%", "95%"]);
    expect(radios[0].checked).toBe(true);
    const t = within(batchTable());
    expect(t.getByRole("columnheader", { name: "90% held-out band, per recipe" })).toBeTruthy();
    // P1's own 90% entry [1.5951, 1.9051].
    expect(t.getAllByRole("row")[1].textContent).toContain("[1.60, 1.91]");
    fireEvent.click(radios[1]);
    expect(within(batchTable()).getByRole("columnheader", { name: "95% held-out band, per recipe" })).toBeTruthy();
    expect(within(batchTable()).getAllByRole("row")[1].textContent).toContain("[1.52, 1.98]");
    expect(screen.getAllByText(/held-out conformal, scaled per recipe; approximate coverage/).length).toBeGreaterThan(0);
  });

  it("shows a refused level's reason and fix and draws no band at it", async () => {
    const a = structuredClone(v2) as Analysis;
    const reason = "14 held-out scores cannot certify 95% coverage";
    const fix = "record at least 5 more run(s) with measured results";
    a.interval_method.levels[1] = { coverage: 0.95, available: false, code: "too_few_calibration_points", reason, what_would_fix_it: fix } as never;
    a.proposals.forEach((p) => (p.intervals[1] = { coverage: 0.95, method: "conformal_normalized", available: false, lo: null, hi: null, reason, what_would_fix_it: fix } as never));
    analysis = a;
    await renderPredict();
    fireEvent.click(within(screen.getByRole("group", { name: "Band coverage" })).getAllByRole("radio")[1]);
    expect(screen.getByText("No 95% band: the engine refused this coverage")).toBeTruthy();
    expect(screen.getAllByText(reason).length).toBeGreaterThan(0);
    expect(screen.getAllByText(fix).length).toBeGreaterThan(0);
    expect(within(batchTable()).getAllByText("Refused").length).toBe(5);
    expect(screen.getAllByText(/no band: the engine refused the 95% level/).length).toBeGreaterThan(0);
  });

  it("adds the model-based chance to beat the named incumbent, EI and the distance to the nearest measured run", async () => {
    await renderPredict();
    const t = within(batchTable());
    expect(t.getByRole("columnheader", { name: /Chance to beat it/ })).toBeTruthy();
    expect(t.getByRole("columnheader", { name: /Nearest measured run/ })).toBeTruthy();
    const p1 = t.getAllByRole("row")[1].textContent ?? "";
    expect(p1).toContain(">99%");
    expect(p1).toContain("0.60");
    expect(p1).toContain("0.81× typical spacing");
    expect(screen.getByText(/model-based \(GP posterior\), not held-out calibrated, compared with the best measured run 1\.42/)).toBeTruthy();
    expect(screen.getByText("How far each proposal is from the measured runs")).toBeTruthy();
  });

  it("uses the engine's target unit, and hints quietly when it found none", async () => {
    await renderPredict();
    expect(screen.getAllByText("Predicted (g/L)").length).toBeGreaterThan(0);
    cleanup();
    analysis = { ...v2, target_unit: { unit: null, source: "none", header: "titer_g_L", note: "" } };
    await renderPredict();
    expect(screen.queryByText("Predicted (g/L)")).toBeNull();
    expect(screen.getByText(/No unit is shown for titer_g_L/)).toBeTruthy();
  });
});

describe("Predict on a v2 analysis: model views", () => {
  it("mounts the 1D slices when opened, labelled model-based and model only", async () => {
    await renderPredict();
    openDisclosure("How the model responds to one input at a time");
    expect(await screen.findByText("90% model-based band, not held-out calibrated")).toBeTruthy();
    expect(screen.getAllByText(/Slices are the model only/).length).toBeGreaterThan(0);
  });

  it("draws the surface's sigma panel from response_surface.std, labelled not an interval", () => {
    render(<ResponseSurface2D surface={v2.response_surface} target="titer_g_L" unit="g/L" width={900} />);
    expect(screen.getByText("Model uncertainty (σ, g/L), not an interval")).toBeTruthy();
    expect(screen.getByText(/^Grey: the model's GP posterior standard deviation of the predicted mean/)).toBeTruthy();
  });
});

describe("Predict on a v2 analysis: setup", () => {
  it("shows the setup refusal with the engine's reason and fix and links to Harmonize", async () => {
    analysis = {
      ...v2,
      proposals: [],
      setup: { status: "refused", goal: "maximize", refusal: { code: "infeasible_constraints", reason: "no recipe satisfies the bounds and constraints together", what_would_fix_it: "loosen the constraint on glucose_gL" } },
      proposal_notice: { code: "setup_not_applied" },
    };
    await renderPredict();
    expect(screen.getByText("No proposals: the campaign setup could not be applied")).toBeTruthy();
    expect(screen.getByText("no recipe satisfies the bounds and constraints together")).toBeTruthy();
    expect(screen.getByText("loosen the constraint on glucose_gL")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit the setup on Harmonize" }).getAttribute("href")).toBe(`/campaigns/${ID}/harmonize`);
    expect(screen.queryByText("The engine proposed no experiments")).toBeNull();
  });

  it("names the minimize goal and takes the gain as best − predicted", async () => {
    analysis = { ...v2, goal: "minimize", best: 1.8, setup: { status: "applied", goal: "minimize", warnings: [] } };
    await renderPredict();
    expect(screen.getByText(/The campaign goal is to minimize titer_g_L/)).toBeTruthy();
    const t = within(batchTable());
    expect(t.getByRole("columnheader", { name: /best − predicted/ })).toBeTruthy();
    // P1 pred 1.75 vs best 1.8: +0.05.
    expect(t.getAllByRole("row")[1].textContent).toContain("+0.05");
  });
});
