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

import PlanPage from "@/app/campaign/plan/page";
import { EngineDataProvider, useEngineWrites } from "@/hooks/use-engine";

/*
 * Component tests for the Plan page's start flow against a real engine
 * response shape (fixtures captured from the engine on the synthetic good.csv).
 * fetch is the only seam: GET latest/campaign, POST start and POST run.
 */

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let starts: { recipes: { recipe: Record<string, number> }[] }[] = [];
let onStart: Handler;
let onCampaign: () => Response;
let onRun: Handler;

beforeEach(() => {
  starts = [];
  onStart = () => json({ ok: true });
  onCampaign = () => json(campaignFixture);
  onRun = () => json({ error: "nope" }, 400);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) return json(latestFixture);
      if (url.endsWith("/api/campaign")) return onCampaign();
      if (url.endsWith("/api/campaign/start")) {
        starts.push(JSON.parse(String(init?.body)));
        return onStart(url, init);
      }
      if (url.endsWith("/api/run")) return onRun(url, init);
      throw new Error(`unexpected fetch ${url}`);
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
    <button type="button" onClick={() => void runFile(new File(["x"], "constant_target.csv"))}>
      test upload
    </button>
  );
}

async function renderPlan(withUpload = false) {
  render(
    <EngineDataProvider>
      {withUpload ? <Upload /> : null}
      <PlanPage />
    </EngineDataProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Plan round 1" });
}

const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled");

/** The header's Approve batch button (the sticky mobile bar repeats it; the header button is the first). */
const reviewButton = () => screen.getAllByRole("button", { name: /^Approve batch$/ })[0];

/** Opens one of the secondary tabs under the batch (Compare, Response surface, Method). */
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${name}`) }));

async function openDialog() {
  fireEvent.click(reviewButton());
  return within(await screen.findByRole("dialog"));
}

// Proposals sorted by predicted value: the fixture's engine index of each display id.
const byPred = [...latestFixture.proposals.map((p, i) => ({ i, pred: p.pred }))].sort((a, b) => b.pred - a.pred);

describe("Plan start flow", () => {
  it("does not start before the approval box is ticked", async () => {
    await renderPlan();
    const dialog = await openDialog();
    const start = dialog.getByRole("button", { name: /^Start 5 runs/ });
    expect(isDisabled(start)).toBe(true);
    fireEvent.click(start);
    expect(starts).toHaveLength(0);
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(starts).toHaveLength(0);
  });

  it("sends exactly the ticked recipes, once, with the engine's exact values", async () => {
    await renderPlan();
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
    const expected = byPred.slice(0, 4).map(({ i }) => latestFixture.proposals[i].recipe);
    expect(sent).toEqual(expected);
  });

  it("shows the exact values in the dialog, matching what is sent", async () => {
    await renderPlan();
    const dialog = await openDialog();
    const first = latestFixture.proposals[byPred[0].i].recipe as Record<string, number>;
    for (const v of Object.values(first)) expect(dialog.getAllByText(String(v)).length).toBeGreaterThan(0);
  });

  it("keeps the dialog open with an error and Start available again after a failed start", async () => {
    onStart = () => json({ error: "boom" }, 500);
    await renderPlan();
    const dialog = await openDialog();
    fireEvent.click(dialog.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: /^Start 5 runs/ }));
    });
    expect((await dialog.findByRole("alert")).textContent).toMatch(/did not confirm the start/);
    expect(isDisabled(dialog.getByRole("button", { name: /^Start 5 runs/ }))).toBe(false);
    expect(starts).toHaveLength(1);
  });

  it("does not offer Start again when the start succeeded but the campaign refresh failed", async () => {
    await renderPlan();
    onCampaign = () => json({ error: "down" }, 502);
    const dialog = await openDialog();
    fireEvent.click(dialog.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: /^Start 5 runs/ }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/Runs started\. If this page has not switched/)).toBeTruthy();
    expect(isDisabled(reviewButton())).toBe(true);
    expect(starts).toHaveLength(1);
  });
});

describe("Plan after a rejected upload", () => {
  const constant = {
    error: "The target column 'lipase_titer' has the same value (5) in every row.",
    code: "target_constant",
    target: "lipase_titer",
    target_summary: { n_numeric: 40, n_distinct: 1, min: 5, max: 5 },
    available_targets: ["biomass_gL"],
  };

  it("pauses Start for a coded rejection until the user keeps the current dataset", async () => {
    onRun = () => json(constant, 400);
    await renderPlan(true);
    fireEvent.click(screen.getByRole("button", { name: "test upload" }));
    expect(await screen.findByText("Your last upload, constant_target.csv, was not used")).toBeTruthy();
    expect(isDisabled(reviewButton())).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Keep planning from good\.csv/ }));
    await waitFor(() => expect(isDisabled(reviewButton())).toBe(false));
  });

  it("does not treat an uncoded error (possibly a server fault) as a rejection", async () => {
    onRun = () => json({ error: "could not analyze the file" }, 400);
    await renderPlan(true);
    fireEvent.click(screen.getByRole("button", { name: "test upload" }));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringMatching(/\/api\/run$/), expect.anything()));
    expect(screen.queryByText(/was not used/)).toBeNull();
    expect(isDisabled(reviewButton())).toBe(false);
  });
});

describe("Plan data notes and provenance", () => {
  it("names categoricals, exclusions and the run fingerprint from the engine's own fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/latest"))
          return json({
            ...latestFixture,
            auto_categorical: ["Strain"],
            n_dropped_incomplete: 2,
            n_censored_excluded: 1,
            run: { kind: "upload", input_sha256: "abcdef0123456789", profile: "bioprocess" },
          });
        if (url.endsWith("/api/campaign")) return json(campaignFixture);
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    await renderPlan();
    expect(screen.getByText(/Strain was read as categorical/)).toBeTruthy();
    expect(screen.getByText(/2 runs with a missing or non-numeric value/)).toBeTruthy();
    expect(screen.getByText(/1 run with a censored value such as <LOD/)).toBeTruthy();
    openTab("Method");
    expect(await screen.findByText("abcdef012345")).toBeTruthy();
  });

  it("says the engine did not report provenance when the run block is absent", async () => {
    await renderPlan();
    openTab("Method");
    expect(await screen.findByText("How this batch was made")).toBeTruthy();
    expect(screen.getByText(/^Not reported: how this analysis was produced/)).toBeTruthy();
  });

  it("mounts the response surface only when its disclosure is opened, labelled predicted mean only", async () => {
    // The fixture's own surface is empty (the engine sent no grid), so the disclosure must not appear for it.
    await renderPlan();
    expect(screen.queryByRole("tab", { name: "Response surface" })).toBeNull();
    cleanup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/latest")) return json({ ...latestFixture, response_surface: surfaceMock.response_surface });
        if (url.endsWith("/api/campaign")) return json(campaignFixture);
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    await renderPlan();
    expect(screen.queryByText(/Predicted mean only, uncertainty not shown/)).toBeNull();
    openTab("Response surface");
    expect(await screen.findByText(/Predicted mean only, uncertainty not shown/)).toBeTruthy();
  });
});
