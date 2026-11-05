// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import LearnPage from "@/app/campaign/learn/page";
import { EngineDataProvider } from "@/hooks/use-engine";

/*
 * Learn's "Plan round N+1" must show the engine's reason when the re-analysis is refused,
 * not a generic "try again". fetch is the only seam.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const CAP = "The dataset is too large for the surrogate; the optimizer targets the small-sample regime, N<=2000.";

// One measured run so the Plan button is enabled (measured = pending runs that are not awaiting a result).
const measuredCampaign = {
  ...campaignFixture,
  n_measured: 1,
  pending: [{ id: "run-1", recipe: { pH: 7 }, pred: 50, std: 1, mode: "exploit", reason: "fixture", result: 51, awaiting: false, round: 0 }],
};

let reanalyzeResponse: () => Response;

beforeEach(() => {
  reanalyzeResponse = () => json({ error: CAP }, 400);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) return json(latestFixture);
      if (url.endsWith("/api/campaign")) return json(measuredCampaign);
      if (url.endsWith("/api/campaign/reanalyze")) return reanalyzeResponse();
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function clickPlan() {
  render(
    <EngineDataProvider>
      <LearnPage />
    </EngineDataProvider>,
  );
  const button = await waitFor(() => {
    const b = screen.getAllByRole("button").find((el) => /^Plan round \d+/.test(el.textContent ?? ""));
    if (!b || (b as HTMLButtonElement).disabled) throw new Error("plan button not ready");
    return b;
  });
  fireEvent.click(button);
}

describe("Learn: a refused re-analysis says why", () => {
  it("shows the fit-row cap in plain words, with the limit and a next step", async () => {
    await clickPlan();
    const callout = await screen.findByText("Could not plan the next round");
    const box = callout.closest("div")!.parentElement!;
    expect(box.textContent).toContain("2,000 complete rows");
    expect(box.textContent).toMatch(/upload a smaller sheet/i);
    expect(box.textContent).toContain("Your recorded results are safe.");
    expect(box.textContent).not.toMatch(/surrogate|N<=|engine responded|try again/i);
  });

  it("a server error with no body gets the service copy, not a bare status", async () => {
    reanalyzeResponse = () => json({}, 500);
    await clickPlan();
    const callout = await screen.findByText("Could not plan the next round");
    const box = callout.closest("div")!.parentElement!;
    expect(box.textContent).toContain("The analysis service hit an error. Try again in a moment.");
    expect(box.textContent).not.toMatch(/engine responded/);
  });
});
