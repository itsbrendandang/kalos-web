// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import latestFixture from "./fixtures/plan-latest.json";
import RecordPage from "@/app/campaign/record/page";
import { EngineDataProvider } from "@/hooks/use-engine";

/*
 * Item 1 of the GxP wording pass: the Record page must say what a re-save really does
 * (it replaces the value; the earlier number is not kept) and must not invite a "correction".
 * The engine stores one result per run and overwrites it on re-log (campaign.py set_result).
 */

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const campaign = {
  has_campaign: true,
  target: "lipase_titer",
  features: ["pH", "Temp_C", "Methanol"],
  n_base: 40,
  best: 49.76,
  round: 1,
  history: [],
  pending: [
    { id: "r-awaiting-0001", recipe: { pH: 7, Temp_C: 30, Methanol: 1 }, pred: 51, std: 1, mode: "exploit", result: null, awaiting: true, measured_at: null },
    { id: "r-measured-0002", recipe: { pH: 6.5, Temp_C: 31, Methanol: 2 }, pred: 50, std: 1, mode: "explore", result: 48.2, awaiting: false, measured_at: 1700000000 },
  ],
  n_awaiting: 1,
  n_measured: 1,
  analysis_in_sync: true,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubEngine() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) return json(latestFixture);
      if (url.endsWith("/api/campaign")) return json(campaign);
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
}

describe("Record page copy", () => {
  it("says a re-save replaces the value and that the earlier number is not kept", async () => {
    stubEngine();
    render(
      <EngineDataProvider>
        <RecordPage />
      </EngineDataProvider>,
    );
    const heading = await screen.findByRole("heading", { level: 1, name: "Record results" });
    expect(heading).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Saving again replaces the value shown/);
    expect(text).toMatch(/keeps only the latest one/);
    expect(text).not.toMatch(/correct a saved value/i);
    expect(text).not.toMatch(/until the model is updated/i);
  });
});
