// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next/link needs the Next router at runtime; a plain anchor is enough here.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ValidatePage from "@/app/campaigns/[id]/validate/page";
import { EngineDataProvider } from "@/hooks/use-engine";
import type { CampaignRun } from "@/lib/api";

/*
 * Component tests for the Validate page against the engine's response shapes
 * (taken from the live default campaign). fetch is the only seam: GET the
 * campaign and its analysis, GET jobs, POST a result, POST reanalyze.
 */

const ID = "cmp_test";
const HASH = "9836c009efd80007d4fbe2e6be5f82b0d5ec884235790e8efa5cc74a45eea0e0";
const prov = { provenance_sha256: HASH, engine_version: "0.1.0", seed: 1234, timestamp: 1795058474 };

const mkRun = (id: string, pred: number, over: Partial<CampaignRun> = {}): CampaignRun => ({
  id, recipe: { pH: 6.97, temperature_C: 36.19, medium_base: "ProCHO" as unknown as number }, pred, std: 0.07, mode: "exploit",
  reason: "predicted high", result: null, awaiting: true, round: 0, created_at: 1795058703.9, measured_at: null, analysis_provenance: prov, ...over,
});

let runs: CampaignRun[];
let summaryOver: Record<string, unknown>;
let results: { url: string; body: { value: number; reason?: string } }[];
let reanalyzeCalls: number;
let onReanalyze: () => Promise<Response>;
let onResult: (body: { value: number; reason?: string }) => Response;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const summary = () => ({
  has_campaign: true, target: "titer_g_L", features: ["pH", "temperature_C"], n_base: 160, best: 1.422, round: 0,
  history: [{ round: 0, best: 1.422, n_base: 160 }], pending: runs,
  n_awaiting: runs.filter((r) => r.awaiting).length, n_measured: runs.filter((r) => !r.awaiting).length, analysis_in_sync: false,
  ...summaryOver,
});
const detail = () => ({
  campaign: { id: ID, name: "Test", created_by: null, created_at: 1, updated_at: 1, archived_at: null, archived: false, seeded: true, is_default: false },
  summary: summary(),
});
const analysis = {
  has_data: true, dataset: "synthetic_bioprocess.csv", updated: 1795058474.2, timestamp: 1795058474, engine_version: "0.1.0",
  target: "titer_g_L", conformal_q: 0.2036, conformal_coverage: 0.9, drivers: [], proposals: [], oof: [], features: [],
  proposal_provenance: { provenance_sha256: HASH },
};

beforeEach(() => {
  runs = [mkRun("aaaaaaa1", 1.75), mkRun("bbbbbbb2", 1.715)];
  summaryOver = {};
  results = [];
  reanalyzeCalls = 0;
  onReanalyze = async () => json({ analysis, campaign: summary() });
  onResult = (body) => json({ ...runs[0], result: body.value, awaiting: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/api/campaigns/${ID}`)) return json(detail());
      if (url.endsWith(`/api/campaigns/${ID}/analysis`)) return json(analysis);
      if (url.includes(`/api/campaigns/${ID}/jobs`)) return json({ jobs: [] });
      if (url.endsWith("/result") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        results.push({ url, body });
        const res = onResult(body);
        if (res.ok) {
          const id = url.split("/runs/")[1].split("/")[0];
          runs = runs.map((r) => (r.id === id ? { ...r, result: body.value, awaiting: false, result_version: (r.result_version ?? 0) + 1 } : r));
        }
        return res;
      }
      if (url.endsWith(`/api/campaigns/${ID}/reanalyze`)) {
        reanalyzeCalls += 1;
        return onReanalyze();
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderValidate() {
  render(
    <EngineDataProvider campaignId={ID}>
      <ValidatePage />
    </EngineDataProvider>,
  );
  await screen.findByRole("heading", { level: 2, name: "In the lab" });
}

const section = (id: string) => within(document.getElementById(id) as HTMLElement);
const reanalyzeButton = () => screen.getByRole("button", { name: /^Re-analyze and propose round 2/ });
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled");

describe("Validate page", () => {
  it("shows the three anchored sections, predictions marked as predicted with the engine's 90% band", async () => {
    await renderValidate();
    for (const id of ["run", "record", "learn"]) expect(document.getElementById(id)).not.toBeNull();
    const lab = section("run");
    expect(lab.getAllByText("± 0.20 (90% band)")).toHaveLength(2);
    expect(lab.getByText("1.75")).toBeTruthy();
    expect(lab.getAllByText("predicted").length).toBeGreaterThan(0); // sr-only label per value
    expect(document.body.textContent).not.toMatch(/95%/);
    // The stepper marks Validate as the page you are on, and links never use the old /campaign/* paths.
    expect(screen.getByRole("link", { current: "step" }).getAttribute("href")).toBe(`/campaigns/${ID}/validate`);
    for (const a of document.querySelectorAll("a[href]")) expect(a.getAttribute("href")).not.toMatch(/^\/campaign\//);
  });

  it("records a first result without a reason and shows it as measured, against its band", async () => {
    await renderValidate();
    fireEvent.change(screen.getByLabelText("Measured result for run aaaaaaa"), { target: { value: "1.62" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save 1 result" }));
    });
    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0].url).toContain(`/api/campaigns/${ID}/runs/aaaaaaa1/result`);
    expect(results[0].body).toEqual({ value: 1.62 });
    const record = section("record");
    await waitFor(() => expect(record.getByText("Inside the band")).toBeTruthy());
    expect(record.getByText("1.62")).toBeTruthy();
    expect(record.getByText(/^Version 1/)).toBeTruthy();
  });

  it("asks for a reason before correcting a recorded value, and shows what it replaced", async () => {
    runs = [mkRun("aaaaaaa1", 1.75, { result: 1.62, awaiting: false, result_version: 1 }), mkRun("bbbbbbb2", 1.715)];
    await renderValidate();
    fireEvent.click(screen.getByRole("button", { name: "Correct the result for run aaaaaaa" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/Corrected value/), { target: { value: "1.64" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save correction" }));
    expect(await dialog.findByText(/Say why the value changed/)).toBeTruthy();
    expect(results).toHaveLength(0);

    fireEvent.change(dialog.getByLabelText(/Reason for the correction/), { target: { value: "dilution error" } });
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Save correction" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(results[0].body).toEqual({ value: 1.64, reason: "dilution error" });
    const record = section("record");
    await waitFor(() => expect(record.getByText(/Version 2, was 1.62/)).toBeTruthy());
    expect(record.getByText("dilution error")).toBeTruthy();
  });

  it("shows the engine's refusal when a correction is not accepted", async () => {
    runs = [mkRun("aaaaaaa1", 1.75, { result: 1.62, awaiting: false, result_version: 1 })];
    onResult = () => json({ error: "a correction to a recorded result needs a reason", code: "reason_required" }, 400);
    await renderValidate();
    fireEvent.click(screen.getByRole("button", { name: "Correct the result for run aaaaaaa" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/Corrected value/), { target: { value: "1.64" } });
    fireEvent.change(dialog.getByLabelText(/Reason for the correction/), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Save correction" }));
    });
    expect(await dialog.findByText(/Correcting a recorded result needs a reason/)).toBeTruthy();
    expect(dialog.queryByText(/reason_required/)).toBeNull();
  });

  it("disables re-analysis with a reason until a result is recorded", async () => {
    await renderValidate();
    expect(isDisabled(reanalyzeButton())).toBe(true);
    expect(screen.getByText(/Record at least one measured result first/)).toBeTruthy();
    fireEvent.click(reanalyzeButton());
    expect(reanalyzeCalls).toBe(0);
  });

  it("says the analysis predates the recorded results and that awaiting runs stay in flight", async () => {
    runs = [mkRun("aaaaaaa1", 1.75, { result: 1.62, awaiting: false, result_version: 1 }), mkRun("bbbbbbb2", 1.715)];
    await renderValidate();
    expect(screen.getByText("The current analysis predates 1 recorded result. Re-analyze to fold it into the model.")).toBeTruthy();
    expect(screen.getByText(/1 run still awaiting a result stays in flight: not folded in and not proposed again/)).toBeTruthy();
  });

  it("shows elapsed time with the honest note while re-analyzing, then links to Predict", async () => {
    runs = [mkRun("aaaaaaa1", 1.75, { result: 1.62, awaiting: false, result_version: 1 }), mkRun("bbbbbbb2", 1.715)];
    let finish!: () => void;
    onReanalyze = () =>
      new Promise<Response>((resolve) => {
        finish = () => {
          runs = runs.filter((r) => r.awaiting);
          summaryOver = { round: 1, best: 1.62, history: [{ round: 0, best: 1.422, n_base: 160 }, { round: 1, best: 1.62, n_base: 161 }], analysis_in_sync: true };
          resolve(json({ analysis, campaign: summary() }));
        };
      });
    await renderValidate();
    await act(async () => {
      fireEvent.click(reanalyzeButton());
    });
    expect(await screen.findByText(/does not report stages for a re-analysis/)).toBeTruthy();
    expect(screen.getByText(/keeps running if you move to another page in this campaign/)).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull(); // no fake percentage
    await act(async () => {
      finish();
    });
    const link = await screen.findByRole("link", { name: /Review round 2 on Predict/ });
    expect(link.getAttribute("href")).toBe(`/campaigns/${ID}/predict`);
    expect(reanalyzeCalls).toBe(1);
    // What the folded round showed, from the engine's history.
    expect(await screen.findByText(/Best measured after round 1: 1.62/)).toBeTruthy();
  });

  it("engine busy: says to wait a minute, without an instant retry", async () => {
    runs = [mkRun("aaaaaaa1", 1.75, { result: 1.62, awaiting: false, result_version: 1 })];
    onReanalyze = async () => json({ error: "busy", code: "engine_busy" }, 503);
    await renderValidate();
    await act(async () => {
      fireEvent.click(reanalyzeButton());
    });
    expect(await screen.findByText(/Try again in about a minute/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("conflict: nothing saved, offers a retry", async () => {
    runs = [mkRun("aaaaaaa1", 1.75, { result: 1.62, awaiting: false, result_version: 1 })];
    onReanalyze = async () => json({ error: "the campaign changed", code: "conflict" }, 409);
    await renderValidate();
    await act(async () => {
      fireEvent.click(reanalyzeButton());
    });
    expect(await screen.findByText(/nothing was saved/)).toBeTruthy();
    onReanalyze = async () => json({ analysis, campaign: summary() });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await waitFor(() => expect(reanalyzeCalls).toBe(2));
  });

  it("with no runs started, points to Predict", async () => {
    runs = [];
    render(
      <EngineDataProvider campaignId={ID}>
        <ValidatePage />
      </EngineDataProvider>,
    );
    expect(await screen.findByText("No runs started yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Predict" }).getAttribute("href")).toBe(`/campaigns/${ID}/predict`);
  });
});
