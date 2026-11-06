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
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/campaign/learn" }));

import LearnPage from "@/app/campaign/learn/page";
import { EngineDataProvider } from "@/hooks/use-engine";

/*
 * Phase 0a follow-up: when Learn cannot re-analyze, the plain reason and next step come first; the engine's
 * own words (here "surrogate") sit in a secondary "Engine message" disclosure, never as the reason.
 */

const CAP = "The dataset is too large for the surrogate; the optimizer targets the small-sample regime, N<=2000.";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  // One measured run, so Plan next is enabled.
  const campaign = {
    ...campaignFixture,
    n_measured: 1,
    pending: [{ id: "r-measured-0001", recipe: { pH: 7, Temp_C: 30, Methanol: 1 }, pred: 51, std: 1, mode: "exploit", result: 49, awaiting: false, measured_at: 1700000000 }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) return json(latestFixture);
      if (url.endsWith("/api/campaign")) return json(campaign);
      if (url.endsWith("/api/campaign/reanalyze")) return json({ error: CAP }, 400);
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("Learn failure state", () => {
  it("leads with the plain reason and next step; the engine's words sit in a secondary disclosure", async () => {
    render(
      <EngineDataProvider>
        <LearnPage />
      </EngineDataProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /^Plan round/ }));
    await screen.findByText("Could not plan the next round");
    expect(screen.getByText(/2,000 complete runs/)).toBeTruthy();
    expect(screen.getByText("Your recorded results are safe.")).toBeTruthy();
    // The engine's sentence is not visible until the disclosure is opened.
    expect(screen.queryByText(/surrogate/)).toBeNull();
    fireEvent.click(screen.getByText("As Kalos wrote it"));
    await waitFor(() => expect(screen.getByText(/surrogate/)).toBeTruthy());
    // Plain copy comes before the engine line in reading order.
    const plain = screen.getByText(/2,000 complete runs/);
    const engine = screen.getByText("As Kalos wrote it");
    expect(plain.compareDocumentPosition(engine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
