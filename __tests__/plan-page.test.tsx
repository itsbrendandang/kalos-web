// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import latestFixture from "./fixtures/plan-latest.json";
import campaignFixture from "./fixtures/plan-campaign.json";
import surfaceMock from "./fixtures/plan-response-surface.json";

// next/link needs the Next router at runtime; a plain anchor is enough here.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import PredictPage from "@/app/campaigns/[id]/predict/page";
import { EngineDataProvider, useEngineWrites } from "@/hooks/use-engine";

/*
 * Component tests for the Predict page (cycle step 2) against a real engine
 * response shape (fixtures captured from the engine on the synthetic good.csv),
 * mounted in the campaign-scoped EngineDataProvider. fetch is the only seam:
 * GET /api/campaigns/{id} (detail), /analysis, /jobs?limit=1, POST /runs
 * (start) and POST /jobs (upload).
 */

const ID = "cmp_test";
const BASE = `/api/engine/api/campaigns/${ID}`;

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const meta = { id: ID, name: "Test campaign", created_by: "t", created_at: 1, updated_at: 1, archived_at: null, archived: false, seeded: true, is_default: false };
const detail = (summary: unknown = campaignFixture) => json({ campaign: meta, summary });

let starts: { recipes: { recipe: Record<string, number> }[] }[] = [];
let analysis: unknown;
let onStart: Handler;
let onDetail: () => Response;
let onUpload: Handler;

beforeEach(() => {
  starts = [];
  analysis = latestFixture;
  onStart = () => json({ started: [] });
  onDetail = () => detail();
  onUpload = () => json({ error: "nope" }, 400);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === BASE && method === "GET") return onDetail();
      if (url === `${BASE}/analysis`) return json(analysis);
      if (url.startsWith(`${BASE}/jobs`) && method === "GET") return json({ jobs: [] });
      if (url === `${BASE}/jobs` && method === "POST") return onUpload(url, init);
      if (url === `${BASE}/runs` && method === "POST") {
        starts.push(JSON.parse(String(init?.body)));
        return onStart(url, init);
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Upload() {
  const { runFile } = useEngineWrites();
  return (
    <button type="button" onClick={() => void runFile(new File(["x"], "constant_target.csv")).catch(() => {})}>
      test upload
    </button>
  );
}

async function renderPredict(withUpload = false, heading = "Predict round 1") {
  render(
    <EngineDataProvider campaignId={ID}>
      {withUpload ? <Upload /> : null}
      <PredictPage />
    </EngineDataProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: heading });
}

const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled");

/** The header's Review button (the header and the mobile bar both render one; the header button is the first). */
const reviewButton = () => screen.getAllByRole("button", { name: /^Review and start/ })[0];

async function openDialog() {
  fireEvent.click(reviewButton());
  return within(await screen.findByRole("dialog"));
}

function openDisclosure(summary: string) {
  const details = screen.getByText(summary).closest("details") as HTMLDetailsElement;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  return details;
}

// The page keeps the engine's order (VIZ_SPEC C2): display id P{n} is proposals[n - 1].
const engineOrder = latestFixture.proposals.map((p, i) => ({ i, pred: p.pred }));

describe("Predict start flow", () => {
  it("does not start before the approval box is ticked", async () => {
    await renderPredict();
    const dialog = await openDialog();
    const start = dialog.getByRole("button", { name: /^Start 5 runs/ });
    expect(isDisabled(start)).toBe(true);
    fireEvent.click(start);
    expect(starts).toHaveLength(0);
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(starts).toHaveLength(0);
  });

  it("sends exactly the ticked recipes, once, with the engine's exact values, to the campaign's runs route", async () => {
    await renderPredict();
    // Untick P5 (the cards and the table each render a checkbox per proposal; they share state).
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Run P5" })[0]);
    const dialog = await openDialog();
    fireEvent.click(dialog.getByRole("checkbox"));
    const start = dialog.getByRole("button", { name: /^Start 4 runs/ });
    expect(isDisabled(start)).toBe(false);
    await act(async () => {
      fireEvent.click(start);
      fireEvent.click(start); // a double click must not send twice
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(starts).toHaveLength(1);
    const sent = starts[0].recipes.map((r) => r.recipe);
    const expected = engineOrder.slice(0, 4).map(({ i }) => latestFixture.proposals[i].recipe);
    expect(sent).toEqual(expected);
  });

  it("shows the exact values in the dialog, matching what is sent", async () => {
    await renderPredict();
    const dialog = await openDialog();
    const first = latestFixture.proposals[engineOrder[0].i].recipe as Record<string, number>;
    for (const v of Object.values(first)) expect(dialog.getAllByText(String(v)).length).toBeGreaterThan(0);
  });

  it("keeps the dialog open with an error and Start available again after a failed start", async () => {
    onStart = () => json({ error: "boom" }, 500);
    await renderPredict();
    const dialog = await openDialog();
    fireEvent.click(dialog.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: /^Start 5 runs/ }));
    });
    expect((await dialog.findByRole("alert")).textContent).toMatch(/did not confirm the start/);
    expect(isDisabled(dialog.getByRole("button", { name: /^Start 5 runs/ }))).toBe(false);
    expect(starts).toHaveLength(1);
  });

  it("does not offer Start again when the start succeeded but the campaign refresh failed; Validate is the action", async () => {
    await renderPredict();
    onDetail = () => json({ error: "down" }, 502);
    const dialog = await openDialog();
    fireEvent.click(dialog.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: /^Start 5 runs/ }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/Runs started\. Record their results on/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Review and start/ })).toBeNull();
    const go = screen.getAllByRole("link", { name: /Go to Validate/ });
    expect(go.length).toBeGreaterThan(0);
    for (const a of go) expect(a.getAttribute("href")).toBe(`/campaigns/${ID}/validate`);
    expect(starts).toHaveLength(1);
  });

  it("switches to the runs-in-flight view after a start the engine confirmed", async () => {
    await renderPredict();
    const pending = engineOrder.map(({ i }, k) => ({ id: `r${k}`, recipe: latestFixture.proposals[i].recipe, pred: latestFixture.proposals[i].pred, std: 1, mode: "explore", reason: "x", result: null, awaiting: true, round: 0 }));
    onDetail = () => detail({ ...campaignFixture, pending, n_awaiting: 5, analysis_in_sync: false });
    const dialog = await openDialog();
    fireEvent.click(dialog.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: /^Start 5 runs/ }));
    });
    expect(await screen.findByText(/5 runs from round 1 are in flight/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Review and start/ })).toBeNull();
    expect(screen.getAllByRole("link", { name: /Go to Validate/ })[0].getAttribute("href")).toBe(`/campaigns/${ID}/validate`);
  });
});

describe("Predict with runs already in flight", () => {
  it("says so and links to Validate instead of inviting a duplicate start", async () => {
    const pending = [{ id: "r1", recipe: { pH: 6 }, pred: 40, std: 1, mode: "exploit", reason: "x", result: null, awaiting: true, round: 0 }];
    onDetail = () => detail({ ...campaignFixture, pending, n_awaiting: 1, analysis_in_sync: false });
    await renderPredict();
    expect(screen.getByText(/1 run from round 1 is in flight/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Review and start/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The evidence the batch was proposed on is still shown.
    expect(screen.getByRole("heading", { name: "Can the model be trusted?" })).toBeTruthy();
  });
});

describe("Predict batch numbers and charts (VIZ_SPEC C2/C3)", () => {
  it("shows the batch strip and setpoint matrix, in the engine's order, with bands at the engine's coverage", async () => {
    await renderPredict();
    expect(screen.getByText("What each proposal is predicted to give")).toBeTruthy();
    expect(screen.getByText("Where the proposals sit in each input's range")).toBeTruthy();
    const table = screen.getAllByRole("table").find((t) => /Model-generated proposals/.test(t.textContent ?? "")) as HTMLElement;
    const t = within(table);
    expect(t.getByRole("columnheader", { name: /^90% held-out band/ })).toBeTruthy();
    const rows = t.getAllByRole("row").slice(1);
    // Engine order: P4 is proposals[3] (pred 51.205); its band [47.37, 55.04] prints at the band's precision.
    expect(rows[3].textContent).toContain("P4");
    expect(rows[3].textContent).toContain("[47, 55]");
    // Predicted gain over the best measured run (49.76): exact difference, band shifted by the same amount.
    expect(rows[3].textContent).toContain("+1");
    expect(rows[3].textContent).toContain("[\u22122, 5]");
    expect(table.textContent).not.toMatch(/95%/);
  });

  it("reads p_feasible as n/a when the engine did not gate the batch on it", async () => {
    analysis = { ...latestFixture, proposals: latestFixture.proposals.map((p) => ({ ...p, p_feasible: 0.2 })) };
    await renderPredict();
    // Ungated (the fixture's proposal_gating.gated is false): no low-feasibility flag and no probability shown.
    expect(screen.queryByText(/engine-estimated feasibility below/)).toBeNull();
    expect(screen.queryByText("20%")).toBeNull();
  });

  it("keeps the batch on screen with measured results once runs are in flight", async () => {
    const p0 = latestFixture.proposals[0];
    const pending = [{ id: "r1", recipe: p0.recipe, pred: p0.pred, std: 1, mode: "explore", reason: "x", result: 48.1, awaiting: false, round: 0 }];
    onDetail = () => detail({ ...campaignFixture, pending, n_awaiting: 0, n_measured: 1, analysis_in_sync: false });
    await renderPredict();
    expect(screen.getByRole("heading", { name: "The batch these runs came from" })).toBeTruthy();
    expect(screen.getAllByText(/The analysis predates 1 recorded result/).length).toBeGreaterThan(0);
  });
});

describe("Predict with no model", () => {
  it("shows an empty state that links to Harmonize", async () => {
    analysis = { has_data: false };
    onDetail = () => detail({ has_campaign: false });
    await renderPredict(false, "Predict");
    expect(screen.getByText("No model yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Harmonize" }).getAttribute("href")).toBe(`/campaigns/${ID}/harmonize`);
  });
});

describe("Predict trust evidence", () => {
  // The trust panel is now the verdict line plus three charts (VIZ_SPEC C8 scorecard, C6 parity, C7
  // calibration). jsdom has no layout width, so the SVGs stay skeletons here; the verdict line, the
  // legends (band, hit count, z_std reading) and the chart subtitles still render and carry the numbers.
  it("shows the reliability verdict, rank agreement with its CI and the engine's floor, evidence counts and the 90% band", async () => {
    analysis = { ...latestFixture, cv_n_groups: 40, cv_n_repeats: 2 };
    await renderPredict();
    const panel = screen.getByRole("heading", { name: "Can the model be trusted?" }).closest("section") as HTMLElement;
    const p = within(panel);
    expect(p.getByText("Reliable")).toBeTruthy();
    expect(p.getByText("ρ 0.88")).toBeTruthy();
    expect(p.getByText("[0.72, 0.93] 95% CI")).toBeTruthy();
    expect(p.getByText("trust floor 0.20")).toBeTruthy();
    expect(p.getByText("40 rows, 40 CV groups, 2 repeats")).toBeTruthy();
    expect(p.getByText("90% held-out band (y = x ± 3.83)")).toBeTruthy();
    expect(p.getByText(/^\d+ of 6 held-out runs inside the band \(\d+%, target 90%\)/)).toBeTruthy();
    expect(panel.textContent).not.toMatch(/95% band|95% coverage/);
    expect(p.getByText(/^Bands read too narrow · ECE 0\.11 · z-spread 1\.25$/)).toBeTruthy();
    expect(p.getByText(/feasibility probability, scale-up transfer/)).toBeTruthy();
  });

  it("reports promotion as reported, not enforced, and shows an unmeasured gate neutrally", async () => {
    analysis = {
      ...latestFixture,
      promotion: {
        passed: false,
        failures: ["feasibility_auc=missing/NaN (unmeasured)", "ece=0.21 > max 0.15"],
        metrics: { surrogate_spearman: 0.88, ece: 0.21 },
        summary: "GATES FAILED",
        meaning: "passed=false means not yet shown fit to promote.",
        not_judged: ["group-mean floor: too few replicated recipes"],
      },
    };
    await renderPredict();
    expect(screen.getByText("Not passed")).toBeTruthy();
    expect(screen.getByText(/Reported, not enforced/)).toBeTruthy();
    expect(screen.getByText("passed=false means not yet shown fit to promote.")).toBeTruthy();
    expect(screen.getByText("Not measurable on this data:")).toBeTruthy();
    expect(screen.getByText("Measured and below its gate:")).toBeTruthy();
    expect(screen.getByText("Not judged:")).toBeTruthy();
  });

  it("shows the engine's space-filling advice when the model is below its floor", async () => {
    analysis = {
      ...latestFixture,
      cv_spearman: 0.1,
      reliability: { ...latestFixture.reliability, spearman: 0.1, ci95: [-0.2, 0.4], clears_floor: false, ci_excludes_zero: false, space_filling_advice: "A space-filling design is expected to do about as well." },
    };
    await renderPredict();
    expect(screen.getByText("Not yet reliable")).toBeTruthy();
    expect(screen.getByText(/treat these 5 proposals as exploration/)).toBeTruthy();
    expect(screen.getByText("A space-filling design is expected to do about as well.")).toBeTruthy();
  });

  it("raises a callout when the model does not beat the group-mean baseline", async () => {
    analysis = { ...latestFixture, cv_group_mean_baseline: { spearman: 0.9, n_evaluable: 30, n_groups_used: 10, interpretation: "most signal is recipe identity", reason: null } };
    await renderPredict();
    expect(screen.getByText("The model does not beat the group-mean baseline")).toBeTruthy();
  });

  // Top-k moved out of the disclosure into the scorecard (VIZ_SPEC C8); method detail (noise) stays one click down.
  it("shows top-k in the scorecard and keeps the method checks in a disclosure", async () => {
    analysis = { ...latestFixture, cv_topk: { overlap: 0.4, k: 5, n: 40, evaluable: true, reason: null } };
    await renderPredict();
    expect(screen.getByText("Top-5 caught")).toBeTruthy();
    expect(screen.getByText("2 of 5 (n = 40)")).toBeTruthy();
    expect(screen.queryByText("Replicate noise")).toBeNull();
    openDisclosure("More checks on the model");
    expect(await screen.findByText("Replicate noise")).toBeTruthy();
  });
});

describe("Predict drivers", () => {
  it("presents only engine-significant drivers as findings and lists the rest as noise", async () => {
    analysis = {
      ...latestFixture,
      drivers: [
        { name: "Temp_C", rho: 0.5, ci95: [0.3, 0.7], significant: true },
        { name: "pH", rho: -0.3, ci95: [-0.5, -0.05], significant: false, ci_excludes_zero: true, survives_fdr: false },
        { name: "Methanol", rho: 0.1, ci95: [-0.2, 0.3], significant: false },
      ],
    };
    await renderPredict();
    const section = screen.getByRole("heading", { name: "What goes with lipase_titer" }).closest("section") as HTMLElement;
    // The forest itself needs a measured width (a skeleton in jsdom); the verdict sentence and frame title render.
    expect(section.textContent).toContain("Temp_C is distinguishable from noise after correcting for testing every input.");
    expect(within(section).getByText("Rank agreement with lipase_titer")).toBeTruthy();
  });

  it("says when no input is distinguishable from noise", async () => {
    analysis = { ...latestFixture, drivers: [{ name: "pH", rho: 0.1, ci95: [-0.2, 0.3], significant: false }] };
    await renderPredict();
    expect(screen.getByText("No input is distinguishable from noise yet after correcting for testing every input.")).toBeTruthy();
  });
});

describe("Predict after a rejected upload", () => {
  const constant = {
    error: "The target column 'lipase_titer' has the same value (5) in every row.",
    code: "target_constant",
    target: "lipase_titer",
    target_summary: { n_numeric: 40, n_distinct: 1, min: 5, max: 5 },
    available_targets: ["biomass_gL"],
  };

  it("pauses Start for a coded rejection until the user keeps the current dataset", async () => {
    onUpload = () => json(constant, 400);
    await renderPredict(true);
    fireEvent.click(screen.getByRole("button", { name: "test upload" }));
    expect(await screen.findByText("Your last upload, constant_target.csv, was not used")).toBeTruthy();
    expect(isDisabled(reviewButton())).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Keep planning from good\.csv/ }));
    await waitFor(() => expect(isDisabled(reviewButton())).toBe(false));
  });

  it("does not treat an uncoded error (possibly a server fault) as a rejection", async () => {
    onUpload = () => json({ error: "could not analyze the file" }, 400);
    await renderPredict(true);
    fireEvent.click(screen.getByRole("button", { name: "test upload" }));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(`${BASE}/jobs`, expect.objectContaining({ method: "POST" })));
    expect(screen.queryByText(/was not used/)).toBeNull();
    expect(isDisabled(reviewButton())).toBe(false);
  });
});

describe("Predict data notes, provenance and source", () => {
  it("names categoricals, exclusions and the run fingerprint from the engine's own fields", async () => {
    analysis = {
      ...latestFixture,
      auto_categorical: ["Strain"],
      n_dropped_incomplete: 2,
      n_censored_excluded: 1,
      run: { kind: "upload", input_sha256: "abcdef0123456789", profile: "bioprocess" },
    };
    await renderPredict();
    expect(screen.getByText(/Strain was read as categorical/)).toBeTruthy();
    expect(screen.getByText(/2 runs with a missing or non-numeric value/)).toBeTruthy();
    expect(screen.getByText(/1 run with a censored value such as <LOD/)).toBeTruthy();
    openDisclosure("How this batch was made");
    expect(await screen.findByText("abcdef012345")).toBeTruthy();
  });

  it("says the engine did not report provenance when the run block is absent", async () => {
    await renderPredict();
    expect(screen.getByText("How this batch was made")).toBeTruthy();
    expect(screen.getByText("not reported")).toBeTruthy();
  });

  it("carries a source line with the dataset, short provenance hash (full in the title), seed and engine version", async () => {
    const hash = "9836c009efd80007d4fbe2e6be5f82b0d5ec884235790e8efa5cc74a45eea0e0";
    analysis = { ...latestFixture, seed: 1234, engine_version: "0.1.0", timestamp: 1795058474, proposal_provenance: { provenance_sha256: hash } };
    await renderPredict();
    const short = screen.getByText("9836c009ef");
    expect(short.closest("[title]")?.getAttribute("title")).toBe(hash);
    expect(screen.getByText("1234")).toBeTruthy();
    expect(screen.getByText("0.1.0")).toBeTruthy();
    expect(screen.getByText("2026-11-19 03:21 UTC")).toBeTruthy();
  });

  it("reads n/a in the source line for values the engine did not send", async () => {
    await renderPredict();
    const provenance = screen.getByText("provenance").parentElement as HTMLElement;
    expect(provenance.textContent).toContain("n/a");
  });

  it("mounts the response surface only when its disclosure is opened, labelled a model prediction", async () => {
    // The fixture's own surface is empty (the engine sent no grid), so the disclosure must not appear for it.
    await renderPredict();
    expect(screen.queryByText("How the model responds to two inputs")).toBeNull();
    cleanup();
    analysis = { ...latestFixture, response_surface: surfaceMock.response_surface };
    await renderPredict();
    expect(screen.getByText("model prediction")).toBeTruthy();
    expect(screen.queryByText(/^Model-predicted lipase_titer/)).toBeNull();
    openDisclosure("How the model responds to two inputs");
    expect((await screen.findAllByText(/^Model-predicted lipase_titer/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Other inputs held at/).length).toBeGreaterThan(0);
  });
});
