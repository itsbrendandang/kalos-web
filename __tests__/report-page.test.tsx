// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import latestFixture from "./fixtures/plan-latest.json";
import campaignFixture from "./fixtures/plan-campaign.json";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ReportPage from "@/app/campaigns/[id]/report/page";
import { EngineDataProvider } from "@/hooks/use-engine";

/*
 * The Report page against real engine response shapes (the Predict page's
 * fixtures), mounted in the campaign-scoped provider. fetch is the only seam.
 */

const ID = "cmp_test";
const BASE = `/api/engine/api/campaigns/${ID}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const meta = { id: ID, name: "Lipase screen #2", created_by: "t", created_at: 1, updated_at: 1, archived_at: null, archived: false, seeded: true, is_default: false };

const run = (over: Record<string, unknown>) => ({
  id: "run_abcdef123456",
  recipe: { temp: 30, ph: 7 },
  pred: 52.1,
  std: 1.2,
  mode: "exploit",
  reason: "predicted high",
  result: null,
  awaiting: true,
  round: 0,
  ...over,
});

let analysis: unknown;
let summary: unknown;

beforeEach(() => {
  analysis = latestFixture;
  summary = campaignFixture;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === BASE) return json({ campaign: meta, summary });
      if (url === `${BASE}/analysis`) return json(analysis);
      if (url.startsWith(`${BASE}/jobs`)) return json({ jobs: [] });
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderReport = () =>
  render(
    <EngineDataProvider campaignId={ID}>
      <ReportPage />
    </EngineDataProvider>,
  );

describe("Report page", () => {
  it("shows an empty state that links to Harmonize before any analysis", async () => {
    analysis = { has_data: false };
    summary = { has_campaign: false };
    renderReport();
    expect(await screen.findByText("Nothing to report yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Harmonize" }).getAttribute("href")).toBe(`/campaigns/${ID}/harmonize`);
    expect(screen.queryByRole("button", { name: /Download data package/ })).toBeNull();
  });

  it("summarizes evidence before the model, with the engine's band coverage", async () => {
    renderReport();
    await screen.findByRole("heading", { level: 1, name: "Report and export" });
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("Evidence")).toBeLessThan(headings.indexOf("Model"));
    expect(screen.getAllByText(/90% band/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/95% band/);
    expect(screen.getByText("What is in this package")).toBeTruthy();
    expect(screen.getByText("Not in this package")).toBeTruthy();
    // No runs yet: the runs CSV is unavailable and says why.
    expect((screen.getByRole("button", { name: /Runs \(CSV\)/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("No runs have been started yet.")).toBeTruthy();
  });

  it("keeps measured and predicted in separate columns of the runs table", async () => {
    summary = {
      ...campaignFixture,
      pending: [run({}), run({ id: "run_measured0001", awaiting: false, result: 50.5, result_version: 1 })],
      n_awaiting: 1,
      n_measured: 1,
      analysis_in_sync: false,
    };
    renderReport();
    await screen.findByRole("heading", { level: 2, name: "Runs" });
    const table = screen.getByRole("table");
    const head = [...table.querySelectorAll("th")].map((th) => th.textContent?.trim());
    expect(head).toContain("Measured");
    expect(head).toContain("Predicted");
    expect(table.textContent).toContain("50.50");
    expect(table.textContent).toContain("Awaiting result");
    expect(screen.getByText("The analysis is older than the latest runs")).toBeTruthy();
  });

  it("downloads the JSON package as a file named after the campaign", async () => {
    const created: Blob[] = [];
    const names: string[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => (created.push(b), "blob:x")), revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    renderReport();
    fireEvent.click(await screen.findByRole("button", { name: /Download data package \(JSON\)/ }));
    expect(names[0]).toMatch(/^kalos-lipase-screen-2-\d{8}\.json$/);
    const pkg = JSON.parse(await created[0].text());
    expect(pkg).toMatchObject({ kind: "kalos.data-package", schema_version: 1, objective: { direction: "maximize" }, model: { conformal: { coverage: 0.9 } } });
  });
});
