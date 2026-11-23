// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutcomeDistribution } from "@/components/viz/charts/outcome-distribution";
import { outcomeDistribution } from "@/lib/viz-data/outcome-distribution";
import type { PopulatedResult } from "@/lib/api";
import fixture from "./fixtures/predict-v2-analysis.json";

vi.mock("@/components/viz/use-width", () => ({ useWidth: () => ({ ref: { current: null }, width: 480 }) }));
afterEach(cleanup);

describe("OutcomeDistribution numeric disclosure", () => {
  it("uses chart precision for bin edges without rounding the bins or changing counts", async () => {
    const oof = Array.from({ length: 64 }, (_, i) => [1.422 * i / 63, 1]);
    render(<OutcomeDistribution analysis={{ ...fixture, oof } as unknown as PopulatedResult} />);
    fireEvent.click(screen.getByText("Data", { exact: true }));
    const table = await screen.findByRole("table");
    expect(table.textContent).not.toContain("0.8887499999999999");
    expect(table.textContent).not.toContain("1.2442499999999999");
    expect(table.textContent).not.toContain("0.17775");
    for (const edge of ["0.178", "0.889", "1.24"]) {
      expect(within(table).getAllByText(edge).length).toBeGreaterThan(0);
      expect(screen.getByRole("img").textContent).toContain(edge);
    }
    const total = within(table).getAllByRole("row").slice(1).reduce((n, row) => n + Number(within(row).getAllByRole("cell")[2].textContent), 0);
    expect(total).toBe(64);
    expect(within(table).getByText(/binning and counts use unrounded values/)).toBeTruthy();
    expect(outcomeDistribution(oof).bins[0].hi).toBe(0.17775);
  });
});
