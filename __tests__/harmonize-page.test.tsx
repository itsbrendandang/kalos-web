// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import analysisFixture from "./fixtures/harmonize-analysis.json";
import refusedSetup from "./fixtures/setup-v2-refused-analysis.json";
import setupOutOfSync from "./fixtures/setup-v2-view-out-of-sync.json";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

import HarmonizePage from "@/app/campaigns/[id]/harmonize/page";
import { EngineDataProvider } from "@/hooks/use-engine";

/*
 * The Harmonize page mounted in the campaign-scoped EngineDataProvider, against
 * engine-shaped responses (the analysis fixture was captured from the engine on
 * synthetic_bioprocess.csv). fetch is the only seam.
 */

const ID = "cmp_test";
const BASE = `/api/engine/api/campaigns/${ID}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const meta = { id: ID, name: "Test campaign", created_by: "t", created_at: 1, updated_at: 1, archived_at: null, archived: false, seeded: false, is_default: false };
const job = (over: Record<string, unknown> = {}) => ({
  id: "job_1",
  campaign_id: ID,
  kind: "analysis",
  state: "running",
  stage: "fitting",
  progress: 0.4,
  attempts: 1,
  created_at: 1_795_000_000,
  started_at: 1_795_000_000,
  finished_at: null,
  updated_at: 1_795_000_000,
  cancel_requested: false,
  input_bytes: 100,
  error: null,
  campaign_generation: null,
  ...over,
});

let analysis: unknown;
let detail: unknown;
let setupView: unknown;
let onPutSetup: (body: unknown) => Response;
let setupPuts: unknown[];
let jobs: unknown[];
let onJob: () => Response;
let onUpload: () => Response;
let uploads: number;
let cancels: number;

beforeEach(() => {
  analysis = { has_data: false };
  detail = { campaign: meta, summary: { has_campaign: false } };
  setupView = { ...setupOutOfSync, campaign_id: ID, setup: { goal: "maximize", bounds: {}, linear_constraints: [], target_unit: null }, source: "default", bounds_report: {}, has_analysis: false, settings_in_sync: null };
  setupPuts = [];
  onPutSetup = (body) => json({ ...(setupView as object), setup: body, source: "stored" });
  jobs = [];
  uploads = 0;
  cancels = 0;
  onJob = () => json({ job: job() });
  onUpload = () => json({ error: "nope" }, 400);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === BASE && method === "GET") return json(detail);
      if (url === `${BASE}/setup` && method === "GET") return json(setupView);
      if (url === `${BASE}/setup` && method === "PUT") {
        const body = JSON.parse(String(init?.body));
        setupPuts.push(body);
        return onPutSetup(body);
      }
      if (url === `${BASE}/analysis`) return json(analysis);
      if (url.startsWith(`${BASE}/jobs`) && method === "GET") return json({ jobs });
      if (url === `${BASE}/jobs` && method === "POST") {
        uploads += 1;
        return onUpload();
      }
      if (url === "/api/engine/api/jobs/job_1") return onJob();
      if (url === "/api/engine/api/jobs/job_1/cancel" && method === "POST") {
        cancels += 1;
        onJob = () => json({ job: job({ state: "cancelled", stage: "cancelled", cancel_requested: true }) });
        return json({ job: job({ cancel_requested: true }) });
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderPage() {
  render(
    <EngineDataProvider campaignId={ID}>
      <HarmonizePage />
    </EngineDataProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Harmonize your data" });
}

function chooseFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

const RUNS = "run_id,pH,medium,titer_g_L\nR1,7,A,1\nR2,6.5,B,1.4\nR3,6.8,A,1.2\n";

/** First run: pick the file, then the setup step reads it; choose the target and press Save and analyze. */
async function setUpAndAnalyze(file: File, opts: { target?: string; minimize?: boolean; bound?: [string, string] } = {}) {
  await act(async () => chooseFile(file));
  await screen.findByRole("heading", { name: "Set up the campaign" });
  if (opts.target) {
    const select = (await screen.findByLabelText(/^Target: the outcome to optimize/)) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: opts.target } });
    await screen.findByRole("group", { name: "Goal" });
  }
  if (opts.minimize) fireEvent.click(screen.getByRole("radio", { name: /^Minimize/ }));
  if (opts.bound) {
    fireEvent.change(screen.getByLabelText("Low bound for pH"), { target: { value: opts.bound[0] } });
    fireEvent.change(screen.getByLabelText("High bound for pH"), { target: { value: opts.bound[1] } });
  }
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Save and analyze/ })));
}

describe("Harmonize: first run", () => {
  it("says what the engine needs, that the goal can be either direction and that bounds narrow but never widen the box", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "Bring your prior data" });
    expect(screen.getByText(/at least 6 complete rows/i)).toBeTruthy();
    expect(screen.getByText(/\.xls\) files are refused/)).toBeTruthy();
    expect(screen.getByText(/maximize or minimize it/)).toBeTruthy();
    expect(screen.getByText(/lowest to its highest observed value/)).toBeTruthy();
    expect(screen.getByText(/can narrow that range, never widen it/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Choose a run sheet/ })).toBeTruthy();
    // No analysis yet: nothing to continue to.
    expect(screen.queryByRole("link", { name: /Continue to Predict/ })).toBeNull();
  });

  it("shows a refused sheet as the engine's reason in plain words, with no job started", async () => {
    onUpload = () => json({ error: "The sheet has 2 data rows; at least 6 runs are needed.", code: "too_few_rows", min_rows: 6, n_rows: 2 }, 400);
    await renderPage();
    await screen.findByRole("heading", { name: "Bring your prior data" });
    // One row: no column varies, so the browser offers no target and the engine suggests one.
    await setUpAndAnalyze(new File(["a,b\n1,2\n"], "tiny.csv", { type: "text/csv" }));
    await screen.findByText("tiny.csv could not be analyzed");
    expect(screen.getByText(/too few rows to fit a model/)).toBeTruthy();
    expect(screen.queryByText("too_few_rows")).toBeNull();
    expect(uploads).toBe(1);
    // Still the first-run state: the setup step stays, and another file can be chosen.
    expect(screen.getByRole("heading", { name: "Set up the campaign" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose another file" })).toBeTruthy();
  });

  it("reads the sheet in the browser, takes the target once, then PUTs the setup before the upload", async () => {
    onUpload = () => json({ job: job({ state: "queued", stage: "queued", progress: 0 }) });
    await renderPage();
    await screen.findByRole("heading", { name: "Bring your prior data" });
    await act(async () => chooseFile(new File([RUNS], "runs.csv", { type: "text/csv" })));
    await screen.findByRole("heading", { name: "Set up the campaign" });
    expect(uploads).toBe(0);
    // Saving without a target is refused before anything is sent.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Save and analyze/ })));
    expect(screen.getByText("Choose the column to optimize.")).toBeTruthy();
    expect(setupPuts).toHaveLength(0);

    const select = screen.getByLabelText(/^Target: the outcome to optimize/) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", "pH", "titer_g_L"]);
    fireEvent.change(select, { target: { value: "titer_g_L" } });
    // The observed range next to the bound, and the categorical-constraint warning, come from the browser's read.
    const row = (await screen.findByLabelText("Low bound for pH")).closest("tr")!;
    expect(row.textContent).toMatch(/6\.500 to 7\.000/);
    expect(screen.getByText(/never widens the search beyond your data/)).toBeTruthy();
    expect(screen.getByText(/This sheet has a categorical input \(medium\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /^Minimize/ }));
    fireEvent.change(screen.getByLabelText("Low bound for pH"), { target: { value: "6.6" } });
    fireEvent.change(screen.getByLabelText("High bound for pH"), { target: { value: "8" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Save and analyze/ })));
    await screen.findByRole("region", { name: "Analysis progress" });
    expect(setupPuts).toEqual([{ goal: "minimize", bounds: { pH: { lo: 6.6, hi: 8 } }, linear_constraints: [], target_unit: null }]);
    expect(uploads).toBe(1);
  });

  it("shows the engine's refusal of the setup in plain words, raw code one click down, and uploads nothing", async () => {
    onPutSetup = () =>
      json(
        {
          error: "the bounds and linear constraints admit no recipe: no point satisfies all of them inside the search range",
          code: "infeasible_constraints",
          what_would_fix_it: "loosen a constraint's right-hand side or widen the bounds",
        },
        400,
      );
    await renderPage();
    await screen.findByRole("heading", { name: "Bring your prior data" });
    await setUpAndAnalyze(new File([RUNS], "runs.csv", { type: "text/csv" }), { target: "titer_g_L", bound: ["6.6", "6.9"] });
    await screen.findByText("The setup was not saved");
    expect(screen.getByText("No recipe satisfies the bounds and the constraints together.")).toBeTruthy();
    // The engine's own what_would_fix_it wins over the app's fallback copy.
    expect(screen.getByText(/What would fix it: loosen a constraint's right-hand side or widen the bounds/)).toBeTruthy();
    expect(screen.queryByText(/^infeasible_constraints$/)).toBeNull();
    expect(screen.getByText("Engine response")).toBeTruthy();
    expect(uploads).toBe(0);
  });

  it("an archived campaign is read-only: nothing can be uploaded", async () => {
    detail = { campaign: { ...meta, archived: true, archived_at: 2 }, summary: { has_campaign: false } };
    await renderPage();
    await screen.findByText(/This campaign is archived, so it is read-only/);
    expect(screen.queryByRole("button", { name: /Choose a run sheet/ })).toBeNull();
  });
});

describe("Harmonize: upload job", () => {
  it("runs an upload this page started as a job, then offers the column check for the held file", async () => {
    onUpload = () => json({ job: job({ state: "queued", stage: "queued", progress: 0 }) });
    onJob = () => {
      analysis = analysisFixture;
      return json({ job: job({ state: "succeeded", stage: "succeeded", progress: 1 }) });
    };
    await renderPage();
    await screen.findByRole("heading", { name: "Bring your prior data" });
    await setUpAndAnalyze(new File([RUNS], "runs.csv", { type: "text/csv" }), { target: "titer_g_L" });
    await screen.findByRole("region", { name: "Analysis progress" });
    await screen.findByRole("heading", { name: "Did Kalos read your columns right?" }, { timeout: 4000 });
    expect(uploads).toBe(1);
    // One place to change the target after an upload: the column check (no second picker above it).
    const targetSection = screen.getByRole("region", { name: "Target and inputs" });
    expect(within(targetSection).getAllByRole("combobox")).toHaveLength(1);
    expect(within(targetSection).getByLabelText("Target")).toBeTruthy();
    expect(screen.getByText(/Roles you declare apply to this upload only/)).toBeTruthy();
    // Confirming is advisory; Continue stays available (secondary until confirmed).
    expect(screen.getByRole("link", { name: /Continue to Predict/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Looks right" }));
    await screen.findByText(/You confirmed these columns/);
  });

  it("shows the engine's progress for a job it did not start (resumed after navigation), with Cancel", async () => {
    jobs = [job()];
    await renderPage();
    const progress = await screen.findByRole("region", { name: "Analysis progress" });
    expect(within(progress).getByText("Analyzing your sheet")).toBeTruthy();
    expect(within(progress).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
    expect(within(progress).getByRole("button", { name: "Cancel" })).toBeTruthy();
    // While the job runs, the first-run intro and upload zone are not offered.
    expect(screen.queryByRole("heading", { name: "Bring your prior data" })).toBeNull();
  });

  it("cancels the running job through the engine and then says it was cancelled", async () => {
    jobs = [job()];
    await renderPage();
    const progress = await screen.findByRole("region", { name: "Analysis progress" });
    await act(async () => fireEvent.click(within(progress).getByRole("button", { name: "Cancel" })));
    expect(cancels).toBe(1);
    await screen.findByText("The upload was cancelled", undefined, { timeout: 4000 });
    expect(screen.getByText(/The analysis was cancelled. Nothing was changed./)).toBeTruthy();
  });

  it("reports a job that failed while resumed, in plain words, and can be dismissed", async () => {
    jobs = [job()];
    onJob = () => json({ job: job({ state: "failed", stage: "failed", error: { code: "worker_exited", message: "" } }) });
    await renderPage();
    await screen.findByRole("region", { name: "Analysis progress" });
    await screen.findByText("The last upload could not be analyzed", undefined, { timeout: 4000 });
    expect(screen.getByText(/stopped unexpectedly/)).toBeTruthy();
    expect(screen.getByText(/Nothing was saved to this campaign/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByText("The last upload could not be analyzed")).toBeNull());
    expect(screen.getByRole("heading", { name: "Bring your prior data" })).toBeTruthy();
  });
});

describe("Harmonize: with an analysis", () => {
  beforeEach(() => {
    analysis = analysisFixture;
  });

  it("offers Continue to Predict and builds Your data from the analysis fields", async () => {
    await renderPage();
    const next = await screen.findByRole("link", { name: /Continue to Predict/ });
    expect(next.getAttribute("href")).toBe(`/campaigns/${ID}/predict`);

    const columns = screen.getAllByRole("table")[0];
    const runId = within(columns).getByText("run_id").closest("tr")!;
    expect(runId.textContent).toMatch(/Left out: treated as an ID/);
    expect(runId.textContent).toMatch(/Kalos \(inferred\)/);
    expect(within(columns).getByText("titer_g_L").closest("tr")!.textContent).toMatch(/Target \(maximized\)/);
    expect(within(columns).getByText("medium_base").closest("tr")!.textContent).toMatch(/Input, categorical \(detected\)/);

    expect(screen.getByRole("heading", { name: "Explored design space" })).toBeTruthy();
    expect(screen.getByText(/It is not an operating range/)).toBeTruthy();
    const design = screen.getAllByRole("table")[1];
    const pH = within(design).getByText("pH").closest("tr")!;
    expect(pH.textContent).toMatch(/6\.01/);
    expect(pH.textContent).toMatch(/7\.59/);
    // Low and high share the precision the input's range supports (lib/num formatSetting): rpm whole, temperature 2 dp.
    const rpm = within(design).getByText("agitation_rpm").closest("tr")!.querySelectorAll("td");
    expect([rpm[1].textContent, rpm[2].textContent]).toEqual(["102", "400"]);
    const temp = within(design).getByText("temperature_C").closest("tr")!.querySelectorAll("td");
    expect([temp[1].textContent, temp[2].textContent]).toEqual(["30.04", "38.97"]);
    expect(within(design).getByText("medium_base").closest("tr")!.textContent).toMatch(/Categorical/);
    expect(screen.getByText(/No range was narrowed/)).toBeTruthy();

    // How the sheet was read, from the run record and the header/orientation fields.
    expect(screen.getByText("Row 1 of the sheet")).toBeTruthy();
    expect(screen.getByText("One run per row, as expected")).toBeTruthy();

    // The source line: dataset, file, short input hash, engine version.
    expect(screen.getByText("52955354d0")).toBeTruthy();
    expect(screen.getByText("0.1.0")).toBeTruthy();
    // The re-analysis roles limitation is stated next to the column roles.
    expect(screen.getByText(/a later re-analysis infers them again/)).toBeTruthy();
  });

  it("opens the correlation and run maps as charts with a source footer (engine fields only)", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "Explored design space" });
    for (const summary of ["How the inputs and the target move together", "Your runs by recipe similarity"]) {
      const details = screen.getByText(summary).closest("details")!;
      details.open = true;
      await act(async () => fireEvent(details, new Event("toggle")));
    }
    expect(screen.getByText("Rank correlation")).toBeTruthy();
    expect(screen.getByText(/^From: Analysis of .* · n = 160 runs · Spearman rank correlation/)).toBeTruthy();
    expect(screen.getByText("Runs by recipe similarity")).toBeTruthy();
    expect(screen.getByText(/^From: Analysis of .* · n = 12 runs · PCA of the standardized/)).toBeTruthy();
  });

  it("hides Continue while an upload job runs and keeps the current analysis on screen", async () => {
    jobs = [job()];
    await renderPage();
    await screen.findByRole("region", { name: "Analysis progress" });
    expect(screen.queryByRole("link", { name: /Continue to Predict/ })).toBeNull();
    expect(screen.getByText(/Shown until the new analysis is ready/)).toBeTruthy();
  });
});

describe("Harmonize: campaign setup on a seeded campaign", () => {
  beforeEach(() => {
    analysis = { ...analysisFixture, ...refusedSetup };
    setupView = { ...setupOutOfSync, campaign_id: ID };
  });

  it("shows the engine's refused setup with its reason and fix, and the target read-only (no picker without the file)", async () => {
    await renderPage();
    const section = await screen.findByRole("region", { name: "Campaign setup" });
    expect(within(section).getByText(/Setup refused: Linear constraints cannot be used with this sheet/)).toBeTruthy();
    expect(within(section).getByText(/optimizer does not support linear constraints together with categorical dimensions/)).toBeTruthy();
    expect(within(section).getByText(/bound on pH reaches past your data/)).toBeTruthy();
    const target = screen.getByRole("region", { name: "Target and inputs" });
    expect(within(target).queryAllByRole("combobox")).toHaveLength(0);
    expect(within(target).getByText("Minimize")).toBeTruthy();
    expect(within(target).getByText(/set in the campaign setup/)).toBeTruthy();
  });

  it("says a changed setup needs a re-upload when nothing is measured, and a re-analysis (linked) when something is", async () => {
    await renderPage();
    await screen.findByText(/A re-analysis needs at least one measured result and this campaign has none yet/);
    cleanup();
    detail = { campaign: { ...meta, seeded: true }, summary: { has_campaign: true, target: "titer_g_L", features: [], n_base: 160, best: 1, round: 0, history: [], pending: [], n_awaiting: 0, n_measured: 2 } };
    await renderPage();
    const link = await screen.findByRole("link", { name: /Re-analyze on Validate/ });
    expect(link.getAttribute("href")).toBe(`/campaigns/${ID}/validate#reanalyze`);
  });

  it("edits the stored setup with the engine's observed and searched ranges, and PUTs the change", async () => {
    await renderPage();
    const low = (await screen.findByLabelText("Low bound for pH")) as HTMLInputElement;
    expect(low.value).toBe("6.5");
    const row = low.closest("tr")!;
    expect(row.textContent).toMatch(/Searched: 6\.50 to 7\.59/);
    expect(row.textContent).toMatch(/reaches past the data/);
    fireEvent.change(screen.getByLabelText("High bound for pH"), { target: { value: "7.2" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save the setup" })));
    await screen.findByText(/Saved\./);
    expect(setupPuts).toEqual([{ goal: "minimize", bounds: { pH: { lo: 6.5, hi: 7.2 } }, linear_constraints: [], target_unit: "g/L" }]);
  });

  it("is read-only on an archived campaign", async () => {
    detail = { campaign: { ...meta, seeded: true, archived: true, archived_at: 2 }, summary: { has_campaign: false } };
    await renderPage();
    await screen.findByText(/archived, so its setup is read-only/);
    expect(screen.queryByRole("button", { name: "Save the setup" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Replace the data" })).toBeNull();
  });
});
