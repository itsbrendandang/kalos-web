// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import analysisFixture from "./fixtures/harmonize-analysis.json";

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
let jobs: unknown[];
let onJob: () => Response;
let onUpload: () => Response;
let uploads: number;
let cancels: number;

beforeEach(() => {
  analysis = { has_data: false };
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
      if (url === BASE && method === "GET") return json({ campaign: meta, summary: { has_campaign: false } });
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

describe("Harmonize: first run", () => {
  it("says what the engine needs, that the target is always maximized and that the box is the observed range", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "Bring your prior data" });
    expect(screen.getByText(/at least 6 complete rows/i)).toBeTruthy();
    expect(screen.getByText(/\.xls\) files are refused/)).toBeTruthy();
    expect(screen.getByText(/always maximizes the target/)).toBeTruthy();
    expect(screen.getByText(/lowest to its highest observed value/)).toBeTruthy();
    expect(screen.getByText(/cannot enter your own bounds/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Upload a run sheet/ })).toBeTruthy();
    // No analysis yet: nothing to continue to.
    expect(screen.queryByRole("link", { name: /Continue to Predict/ })).toBeNull();
  });

  it("shows a refused sheet as the engine's reason in plain words, with no job started", async () => {
    onUpload = () => json({ error: "The sheet has 2 data rows; at least 6 runs are needed.", code: "too_few_rows", min_rows: 6, n_rows: 2 }, 400);
    await renderPage();
    await screen.findByRole("heading", { name: "Bring your prior data" });
    await act(async () => chooseFile(new File(["a,b\n1,2\n"], "tiny.csv", { type: "text/csv" })));
    await screen.findByText("tiny.csv could not be analyzed");
    expect(screen.getByText(/too few rows to fit a model/)).toBeTruthy();
    expect(screen.queryByText("too_few_rows")).toBeNull();
    expect(uploads).toBe(1);
    // Still the first-run state: the sheet can be fixed and uploaded again.
    expect(screen.getByRole("heading", { name: "Bring your prior data" })).toBeTruthy();
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
    await act(async () => chooseFile(new File(["pH,titer_g_L\n7,1\n"], "runs.csv", { type: "text/csv" })));
    await screen.findByRole("region", { name: "Analysis progress" });
    await screen.findByRole("heading", { name: "Did Kalos read your columns right?" }, { timeout: 4000 });
    expect(uploads).toBe(1);
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

  it("hides Continue while an upload job runs and keeps the current analysis on screen", async () => {
    jobs = [job()];
    await renderPage();
    await screen.findByRole("region", { name: "Analysis progress" });
    expect(screen.queryByRole("link", { name: /Continue to Predict/ })).toBeNull();
    expect(screen.getByText(/Shown until the new analysis is ready/)).toBeTruthy();
  });
});
