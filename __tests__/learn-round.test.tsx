// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import latestFixture from "./fixtures/plan-latest.json";
import campaignFixture from "./fixtures/plan-campaign.json";
import { campaignKey, insideRange, learnedRound, rememberRound, roundChanges, snapshotOf, type RoundRecord } from "@/lib/learn-record";
import type { PopulatedResult } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/campaign/learn" }));

import LearnPage from "@/app/campaign/learn/page";
import { EngineDataProvider } from "@/hooks/use-engine";

/*
 * First-time study, F5: Learn shows the recorded runs of the round first (measured, with the recipe and
 * the result), says whether the model has learned from them, and after the update says what changed,
 * worked out on the web from the campaign's rounds and a copy kept in this browser, and labelled so.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const latest = latestFixture as unknown as PopulatedResult;
const measuredRuns = [
  { id: "aaa1", recipe: { pH: 7, Temp_C: 30, Methanol: 1 }, pred: 51, std: 1, mode: "exploit", reason: "", result: 49, awaiting: false, round: 0 },
  { id: "bbb2", recipe: { pH: 6, Temp_C: 32, Methanol: 2 }, pred: 40, std: 1, mode: "explore", reason: "", result: 52.5, awaiting: false, round: 0 },
  { id: "ccc3", recipe: { pH: 6.5, Temp_C: 31, Methanol: 1.5 }, pred: 45, std: 1, mode: "explore", reason: "", result: null, awaiting: true, round: 0 },
];

let campaign: Record<string, unknown>;
let reanalyzed = 0;

beforeEach(() => {
  localStorage.clear();
  reanalyzed = 0;
  campaign = { ...campaignFixture, n_measured: 2, n_awaiting: 1, pending: measuredRuns };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) return json(reanalyzed ? { ...latestFixture, n: 42, cv_spearman: 0.91, conformal_q: 3.1, dataset: "campaign round 1" } : latestFixture);
      if (url.endsWith("/api/campaign")) return json(campaign);
      if (url.endsWith("/api/campaign/reanalyze")) {
        reanalyzed++;
        campaign = {
          ...campaignFixture,
          round: 1,
          n_base: 42,
          best: 52.5,
          history: [
            { round: 0, best: 49.76, n_base: 40 },
            { round: 1, best: 52.5, n_base: 42 },
          ],
          n_measured: 0,
          n_awaiting: 1,
          pending: [measuredRuns[2]],
        };
        return json({ analysis: { ...latestFixture, n: 42, cv_spearman: 0.91, conformal_q: 3.1 }, campaign });
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

const renderLearn = () =>
  render(
    <EngineDataProvider>
      <LearnPage />
    </EngineDataProvider>,
  );

describe("the pure rules", () => {
  it("insideRange compares the result with the prediction against the band", () => {
    expect(insideRange({ pred: 51, result: 49 }, 3.8)).toBe(true);
    expect(insideRange({ pred: 40, result: 52.5 }, 3.8)).toBe(false);
    expect(insideRange({ pred: 40, result: 52.5 }, null)).toBeNull();
  });
  it("roundChanges reads runs and best from the campaign's rounds, and the score, range and inputs from the browser's record", () => {
    const history = [
      { round: 0, best: 49.76, n_base: 40 },
      { round: 1, best: 52.5, n_base: 42 },
    ];
    const before = snapshotOf(latest);
    const record: RoundRecord = {
      campaign: "lipase_titer:40",
      round: 1,
      target: "lipase_titer",
      columns: ["Methanol", "pH", "Temp_C"],
      runs: [],
      before,
      after: { ...before, n: 42, rankScore: 0.91, band: 3.1, features: ["pH", "Temp_C"] },
      at: "2026-01-01T00:00:00Z",
    };
    const texts = roundChanges({ history, engineRound: 1, target: "lipase_titer", record }).map((c) => `${c.source}: ${c.text}`);
    expect(texts).toEqual([
      "kalos: The model now learns from 42 runs, 2 more than before.",
      "kalos: Best measured lipase_titer rose from 49.76 to 52.50.",
      "browser: Rank agreement on runs the model had not seen went from 0.88 to 0.91 (better).",
      "browser: The likely range went from ± 3.83 to ± 3.10 (narrower).",
      "browser: The inputs changed: Kalos stopped using Methanol. Your column choice on Setup was not kept by the update.",
    ]);
    expect(roundChanges({ history: history.slice(0, 1), engineRound: 0, target: "t", record: null })).toEqual([]);
  });
  it("remembers a round in this browser by campaign and round", () => {
    const key = campaignKey({ target: "lipase_titer", history: [{ round: 1, n_base: 42 }, { round: 0, n_base: 40 }] });
    expect(key).toBe("lipase_titer:40");
    expect(learnedRound(key, 1)).toBeNull();
    const rec: RoundRecord = { campaign: key, round: 1, target: "t", columns: [], runs: [], before: snapshotOf(latest), after: null, at: "x" };
    rememberRound(rec);
    rememberRound({ ...rec, at: "y" });
    expect(learnedRound(key, 1)?.at).toBe("y");
    expect(learnedRound(key, 2)).toBeNull();
  });
});

describe("Learn shows the round's results first", () => {
  it("lists each recorded run with its label, recipe, prediction, result and range check, and says the model has not learned from them yet", async () => {
    renderLearn();
    const section = (await screen.findByRole("heading", { level: 2, name: "What round 1 measured" })).closest("section")!;
    expect(within(section).getByText(/2 results recorded\. The model has not learned from them yet/)).toBeTruthy();
    const rows = within(section).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const cells = (r: HTMLElement) => within(r).getAllByRole("cell").map((c) => c.textContent?.trim());
    // The same label and column order as Plan, Run and Record (the sheet's order: Methanol, pH, Temp_C).
    expect(within(section).getAllByRole("columnheader").map((h) => h.textContent?.trim()).slice(0, 4)).toEqual(["Recipe", "Methanol", "pH", "Temp_C"]);
    expect(cells(rows[0]).slice(0, 7)).toEqual(["P1Best bet", "1.00", "7.00", "30.00", "51.00", "49.00", "-2.00"]);
    expect(within(rows[0]).getByText("Yes")).toBeTruthy();
    expect(within(rows[1]).getByText("No")).toBeTruthy();
    expect(within(section).getByText(/1 of 2 landed inside the likely range of ± 3.83/)).toBeTruthy();
    // The results come before the verdict.
    const verdict = screen.getByText(/^Reliable\.$/);
    expect(section.compareDocumentPosition(verdict) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/Nothing yet: the model has not learned from this round's results/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update the model and plan round 2" })).toBeTruthy();
  });

  it("after the update, keeps the learned runs in this browser and says what changed, labelled as worked out here", async () => {
    renderLearn();
    fireEvent.click(await screen.findByRole("button", { name: "Update the model and plan round 2" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/campaign/plan"));
    const stored = learnedRound("lipase_titer:40", 1)!;
    expect(stored.runs.map((r) => r.label)).toEqual(["P1", "P2"]);
    expect(stored.after?.n).toBe(42);
    cleanup();
    renderLearn();
    const section = (await screen.findByRole("heading", { level: 2, name: "What round 1 measured" })).closest("section")!;
    await within(section).findByText(/2 results the model learned from when you planned round 2\. Kept in this browser/);
    expect(within(section).getAllByRole("row").slice(1)).toHaveLength(2);
    const changed = screen.getByRole("heading", { level: 2, name: "What changed since round 0" }).closest("section")!;
    expect(within(changed).getByText("The model now learns from 42 runs, 2 more than before.")).toBeTruthy();
    expect(within(changed).getByText("Best measured lipase_titer rose from 49.76 to 52.50.")).toBeTruthy();
    expect(within(changed).getByText(/from a copy kept in this browser\. Kalos does not yet report what an update changed/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /See the plan for round 2/ })).toBeTruthy();
  });
});
