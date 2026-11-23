// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RunCatalog } from "@/components/validate/run-catalog";
import type { CampaignRun } from "@/lib/api";

afterEach(cleanup);

const run = (id: string, round: number): CampaignRun => ({
  id, round, recipe: {}, pred: 1.75, std: 0.1, pred_source: "engine", mode: "exploit",
  reason: "Fixture", result: null, awaiting: true, created_at: 0, measured_at: null,
});

describe("RunCatalog", () => {
  it("searches the one-based round shown in the table, not the engine's zero-based round", async () => {
    render(<RunCatalog runs={[run("alpha", 2), run("beta", 3)]} target="titer" unit="g/L" />);
    fireEvent.click(screen.getByText("Search and inspect run records"));
    const input = await screen.findByRole("searchbox", { name: "Find a run or recipe value" });
    fireEvent.change(input, { target: { value: "3" } });
    const table = screen.getByRole("table");
    expect(within(table).getByText("alpha")).toBeTruthy();
    expect(within(table).queryByText("beta")).toBeNull();
    expect(within(table).getByText("3", { selector: "td" })).toBeTruthy();
    fireEvent.change(input, { target: { value: "4" } });
    expect(within(table).getByText("beta")).toBeTruthy();
    expect(within(table).queryByText("alpha")).toBeNull();
  });
});
