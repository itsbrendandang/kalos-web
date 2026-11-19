// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import latestFixture from "./fixtures/plan-latest.json";
import campaignFixture from "./fixtures/plan-campaign.json";
import v2Analysis from "./fixtures/report-v2-analysis.json";
import v2Detail from "./fixtures/report-v2-detail.json";
import v2Gates from "./fixtures/report-v2-gates.json";
import v2History from "./fixtures/report-v2-history.json";
import v2Computed from "./fixtures/report-v2-operating-ranges-computed.json";
import v2NotComputed from "./fixtures/report-v2-operating-ranges-not-computed.json";
import v2Rows from "./fixtures/report-v2-export-rows.json";
import v2Setup from "./fixtures/report-v2-setup.json";

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
/** Per-route overrides: a Response factory, keyed by "METHOD path?query". */
let routes: Record<string, (init?: RequestInit) => Response>;
let calls: { url: string; method: string; body: string | null }[];

beforeEach(() => {
  analysis = latestFixture;
  summary = campaignFixture;
  calls = [];
  routes = {
    [`GET ${BASE}/export/rows?format=json`]: () => json(v2Rows),
    [`GET ${BASE}/export/rows?format=csv`]: () =>
      new Response("kalos_origin,kalos_folded_in_round,pH\r\nupload,0,6.2\r\n", { status: 200, headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="cmp_test-rows.csv"' } }),
    [`GET ${BASE}/gates`]: () => json(v2Gates),
    [`GET ${BASE}/setup`]: () => json(v2Setup),
    [`GET ${BASE}/results/history?section=all&limit=50`]: () => json(v2History),
    [`GET ${BASE}/results/history?section=all&limit=500`]: () => json(v2History),
    [`POST ${BASE}/operating-ranges`]: () => json(v2NotComputed),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: typeof init?.body === "string" ? init.body : null });
      if (url === BASE) return json({ campaign: meta, summary });
      if (url === `${BASE}/analysis`) return json(analysis);
      if (url.startsWith(`${BASE}/jobs`)) return json({ jobs: [] });
      const route = routes[`${method} ${url}`];
      if (route) return route(init);
      throw new Error(`unexpected fetch ${method} ${url}`);
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
    expect(screen.getAllByText(/90% held-out band/).length).toBeGreaterThan(0);
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
    const runsRegion = await screen.findByRole("region", { name: "Runs" });
    const table = within(runsRegion).getByRole("table");
    const head = [...table.querySelectorAll("th")].map((th) => th.textContent?.trim());
    expect(head).toContain("Measured");
    expect(head).toContain("Predicted");
    expect(table.textContent).toContain("50.5");
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
    await screen.findByText("Recorded results");
    fireEvent.click(await screen.findByRole("button", { name: /Download data package \(JSON\)/ }));
    await waitFor(() => expect(names).toHaveLength(1));
    expect(names[0]).toMatch(/^kalos-lipase-screen-2-\d{8}\.json$/);
    const pkg = JSON.parse(await created[0].text());
    expect(pkg).toMatchObject({ kind: "kalos.data-package", schema_version: 2, objective: { direction: "maximize" }, model: { conformal: { coverage: 0.9 } } });
    // The full history is read for the package (limit 500), and the report sections are in it.
    expect(calls.some((c) => c.url.endsWith("/results/history?section=all&limit=500"))).toBe(true);
    expect(pkg.result_history).toMatchObject({ status: "included", complete: true });
    expect(pkg.result_history.results.some((r: { is_correction: boolean }) => r.is_correction)).toBe(true);
    expect(pkg.raw_rows).toMatchObject({ status: "included", n_original_rows: 160, original_rows_identifiable: true });
    expect(pkg.gates).toMatchObject({ status: "included" });
    expect(pkg.operating_ranges).toMatchObject({ status: "not_requested" });
  });
});

describe("Report page, engine v2 sections", () => {
  beforeEach(() => {
    analysis = v2Analysis;
    summary = v2Detail.summary;
  });

  it("shows the result history newest first with the correction marked, and the audit log in plain words", async () => {
    renderReport();
    const history = await screen.findByRole("region", { name: "Result history and audit log" });
    expect(history.id).toBe("history");
    const [results, audit] = await within(history).findAllByRole("table");
    const head = [...results.querySelectorAll("th")].map((th) => th.textContent?.trim());
    expect(head).toContain("Measured (g/L)");
    const rows = within(results).getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("Correction");
    expect(rows[0].textContent).toContain("1.68");
    expect(rows[0].textContent).toContain("1.60");
    expect(rows[0].textContent).toContain("E2E fixture: re-read plate");
    expect(rows[1].textContent).not.toContain("Correction");
    expect(within(audit).getAllByText("Recorded or corrected a measured result").length).toBeGreaterThan(0);
    expect(within(audit).getAllByText("campaign.result")[0].tagName).toBe("CODE");
    // The audit detail JSON is never rendered as prose (only inside a closed disclosure).
    expect(history.textContent).not.toContain('"new_value"');
    expect(within(history).getByText(/append-only run_results rows/)).toBeTruthy();
  });

  it("pages each history section through its own cursor", async () => {
    routes[`GET ${BASE}/results/history?section=all&limit=50`] = () =>
      json({ ...v2History, audit: { ...v2History.audit, has_more: true, next_before_id: 31 } });
    routes[`GET ${BASE}/results/history?section=audit&limit=50&audit_before_id=31`] = () =>
      json({ campaign_id: ID, limit: 50, audit: { items: [{ id: 30, ts: 1795000000, subject: "ana", action: "campaign.create", outcome: "ok", detail: null }], has_more: false, next_before_id: null } });
    renderReport();
    const history = await screen.findByRole("region", { name: "Result history and audit log" });
    expect(await within(history).findByText("Start of the recorded results reached.")).toBeTruthy();
    fireEvent.click(within(history).getByRole("button", { name: "Load older" }));
    expect(await within(history).findByText("ana")).toBeTruthy();
    expect(within(history).getByText("Start of the audit log reached.")).toBeTruthy();
  });

  it("summarizes the raw rows export and downloads the engine's CSV", async () => {
    const names: string[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    renderReport();
    const raw = await screen.findByRole("region", { name: "Raw data (as uploaded + folded results)" });
    await within(raw).findByText("Original upload");
    expect(raw.textContent).toContain("160");
    expect(raw.textContent).toContain("Not anonymized");
    expect(raw.textContent).toMatch(/leading apostrophe/);
    fireEvent.click(within(raw).getByRole("button", { name: /Raw rows \(engine CSV\)/ }));
    await waitFor(() => expect(names).toEqual(["cmp_test-rows.csv"]));
  });

  it("says plainly when the engine refuses an anonymized export, rather than risk a leak", async () => {
    routes[`GET ${BASE}/export/rows?format=json`] = () =>
      json({ error: "the anonymized aliases could not be reproduced", code: "anonymized_export_unavailable" }, 409);
    renderReport();
    const raw = await screen.findByRole("region", { name: "Raw data (as uploaded + folded results)" });
    expect(await within(raw).findByText("Export refused to protect anonymized names")).toBeTruthy();
    expect(raw.textContent).toMatch(/refused rather than risk a leak/);
    expect(raw.textContent).toContain("Engine: the anonymized aliases could not be reproduced");
    expect(within(raw).queryByRole("button", { name: /Raw rows/ })).toBeNull();
  });

  it("asks for operating ranges and shows the engine's not_computed reason in plain words with what would fix it", async () => {
    renderReport();
    const section = await screen.findByRole("region", { name: "Operating ranges" });
    fireEvent.change(within(section).getByLabelText(/Threshold \(g\/L\)/), { target: { value: "1.5" } });
    expect(section.textContent).toMatch(/Rule: at least 90% probability/);
    fireEvent.click(within(section).getByRole("button", { name: "Compute operating ranges" }));
    expect(await within(section).findByText("Not computed by the engine")).toBeTruthy();
    expect(section.textContent).toMatch(/does not give even the best measured recipe enough chance/);
    expect(section.textContent).toMatch(/Lower the threshold or the probability/);
    const post = calls.find((c) => c.method === "POST")!;
    expect(JSON.parse(post.body!)).toEqual({ threshold: 1.5, probability: 0.9, basis: "target" });
  });

  it("labels the probability from the input, not a fixed value", async () => {
    renderReport();
    const section = await screen.findByRole("region", { name: "Operating ranges" });
    fireEvent.change(within(section).getByLabelText(/Threshold/), { target: { value: "1" } });
    fireEvent.change(within(section).getByLabelText(/Probability/), { target: { value: "0.75" } });
    expect(section.textContent).toMatch(/Rule: at least 75% probability/);
    fireEvent.change(within(section).getByLabelText(/Probability/), { target: { value: "0.3" } });
    fireEvent.click(within(section).getByRole("button", { name: "Compute operating ranges" }));
    expect(await within(section).findByText(/Enter a probability from 0.5 to 0.99/)).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("shows computed ranges as model-based, to verify experimentally, with the engine's caveats", async () => {
    routes[`POST ${BASE}/operating-ranges`] = () => json(v2Computed);
    renderReport();
    const section = await screen.findByRole("region", { name: "Operating ranges" });
    fireEvent.change(within(section).getByLabelText(/Threshold/), { target: { value: "0.2" } });
    fireEvent.change(within(section).getByLabelText(/Probability/), { target: { value: "0.5" } });
    fireEvent.click(within(section).getByRole("button", { name: "Compute operating ranges" }));
    expect(await within(section).findByText(/Model-based estimate, must be verified experimentally/)).toBeTruthy();
    const table = within(section).getByRole("table");
    expect(within(table).getByText("pH").closest("tr")!.textContent).toContain("6.37");
    expect(section.textContent).toContain("26% of the search box meets the rule");
    expect(section.textContent).toMatch(/probabilities may be overstated/);
  });

  it("tells the user to retry later when the engine is busy", async () => {
    routes[`POST ${BASE}/operating-ranges`] = () => json({ error: "busy", code: "engine_busy" }, 503);
    renderReport();
    const section = await screen.findByRole("region", { name: "Operating ranges" });
    fireEvent.change(within(section).getByLabelText(/Threshold/), { target: { value: "1" } });
    fireEvent.click(within(section).getByRole("button", { name: "Compute operating ranges" }));
    expect(await within(section).findByText(/busy with another fit/)).toBeTruthy();
  });

  it("shows residuals and the in-band check recorded at start in the runs table", async () => {
    renderReport();
    const runs = await screen.findByRole("region", { name: "Runs" });
    const table = within(runs).getByRole("table");
    const head = [...table.querySelectorAll("th")].map((th) => th.textContent?.trim());
    expect(head).toContain("Residual (g/L)");
    expect(head).toContain("In band at start");
    expect(table.textContent).toContain("\u22120.07");
    expect(table.textContent).toContain("Inside");
  });
});
