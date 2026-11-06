// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordForm } from "@/components/campaign/record-form";
import { RunsTable } from "@/components/campaign/runs-table";
import { recipeColumns, recipeInline, recipesAsText, runLabels, runRound } from "@/lib/recipe-identity";
import type { CampaignRun } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-engine", () => ({ useEngineWrites: () => ({ logResult: async () => undefined }) }));

afterEach(cleanup);

/*
 * First-time study, F8: a recipe keeps one identity from Plan to Run to Record: the P1..Pn label, and
 * every input as a column in the sheet's order. Copy gives the same table.
 */

const run = (id: string, recipe: Record<string, number>, extra: Partial<CampaignRun> = {}): CampaignRun => ({
  id,
  recipe,
  pred: 100,
  std: 1,
  mode: "exploit",
  reason: "",
  result: null,
  awaiting: true,
  ...extra,
});

// The sheet's order is CarbonSource, Carbon_conc, Gly, Met, SP; the engine's proposal_features put SP first.
const SHEET = ["Carbon_conc", "Gly", "Met", "SP"];
const PROPOSED = ["SP", "Met", "Gly"];
const runs = [
  run("b4560e0a", { SP: 8.97, Met: 8.15, Gly: 6.27, Carbon_conc: 44.19, CarbonSource: 0 }, { pred: 110.22 }),
  run("c03d9a7b", { SP: 9.1, Met: 8.0, Gly: 6.0, Carbon_conc: 40.0, CarbonSource: 0 }, { pred: 109.85, result: 98.5, awaiting: false }),
  run("3219b7ac", { SP: 4.0, Met: 2.0, Gly: 1.0, Carbon_conc: 10.0, CarbonSource: 0 }, { pred: 43.63 }),
];

describe("recipeColumns", () => {
  it("lists every input any recipe sets, in the sheet's order, and leaves out columns that are not inputs", () => {
    expect(recipeColumns(runs.map((r) => r.recipe), SHEET, PROPOSED)).toEqual(["Carbon_conc", "Gly", "Met", "SP"]);
  });
  it("falls back to the engine's proposal order for an input the analysis no longer lists", () => {
    expect(recipeColumns(runs.map((r) => r.recipe), ["Gly", "Met", "SP"], ["SP", "Met", "Gly", "Carbon_conc"])).toEqual(["Gly", "Met", "SP", "Carbon_conc"]);
    expect(recipeColumns(runs.map((r) => r.recipe), [], PROPOSED)).toEqual(["SP", "Met", "Gly"]);
  });
});

describe("runLabels", () => {
  it("numbers the runs by the order they were started, P1..Pn, never the hex id", () => {
    expect([...runLabels(runs).values()]).toEqual(["P1", "P2", "P3"]);
  });
  it("carries the round people see only when runs of two rounds are in the list", () => {
    const mixed = [run("a", {}, { round: 0 }), run("b", {}, { round: 0 }), run("c", {}, { round: 1 })];
    expect([...runLabels(mixed).values()]).toEqual(["R1-P1", "R1-P2", "R2-P1"]);
    expect([...runLabels(mixed.slice(0, 2)).values()]).toEqual(["P1", "P2"]);
    expect(runRound(mixed[2])).toBe(2);
    expect(runRound(run("d", {}))).toBeNull();
  });
});

describe("recipesAsText (Copy)", () => {
  it("is a tab-separated table: label, the inputs in column order, predicted and measured, exact values", () => {
    const cols = recipeColumns(runs.map((r) => r.recipe), SHEET, PROPOSED);
    const labels = runLabels(runs);
    const text = recipesAsText(
      runs.map((r) => ({ label: labels.get(r.id)!, recipe: r.recipe, predicted: r.pred, measured: r.result })),
      cols,
      "Titer",
      { measured: true, round: 1 },
    );
    expect(text.split("\n")).toEqual([
      "Round 1",
      "Recipe\tCarbon_conc\tGly\tMet\tSP\tPredicted Titer\tMeasured Titer",
      "P1\t44.19\t6.27\t8.15\t8.97\t110.22\t",
      "P2\t40\t6\t8\t9.1\t109.85\t98.5",
      "P3\t10\t1\t2\t4\t43.63\t",
    ]);
    expect(recipeInline(runs[0].recipe, cols)).toBe("Carbon_conc 44.19 · Gly 6.27 · Met 8.15 · SP 8.97");
  });
});

describe("Run and Record show the same recipe as Plan", () => {
  const cols = recipeColumns(runs.map((r) => r.recipe), SHEET, PROPOSED);
  const labels = runLabels(runs);

  it("Run: P-labels, every input as a column in order, and 'not yet' for a missing result", () => {
    render(<RunsTable runs={runs} columns={cols} labels={labels} band={{ halfWidth: 27.54 }} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(headers.slice(0, 5)).toEqual(["Recipe", "Carbon_conc", "Gly", "Met", "SP"]);
    const first = screen.getAllByRole("row")[1];
    expect(within(first).getByText("P1")).toBeTruthy();
    expect(first.textContent).not.toContain("b4560e0");
    expect(within(first).getAllByRole("cell").slice(1, 5).map((c) => c.textContent)).toEqual(["44.19", "6.27", "8.15", "8.97"]);
    expect(within(first).getByText("not yet")).toBeTruthy();
  });

  it("Record: the same labels and columns, rows in start order, the result column named after the target", () => {
    render(<RecordForm runs={runs} round={0} best={113.65} unit="" columns={cols} labels={labels} target="Titer" />);
    expect(screen.getByRole("columnheader", { name: "Measured Titer" })).toBeTruthy();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["P1", "P2", "P3"]);
    const input = screen.getByLabelText("Measured Titer for P2") as HTMLInputElement;
    expect(input.value).toBe("98.5");
    fireEvent.change(screen.getByLabelText("Measured Titer for P1"), { target: { value: "52.1" } });
    // A saved row keeps its place: the order is the start order, never "awaiting first".
    expect(screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["P1", "P2", "P3"]);
  });
});
