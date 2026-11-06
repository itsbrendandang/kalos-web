// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "@/components/data/data-table";
import { tableRows } from "@/components/data/rows";
import { profileSheet } from "@/components/campaign/data/profile";

afterEach(cleanup);

const csv = (text: string) => text.trim().split("\n").map((l) => l.split(","));

// Rows 1 and 4 repeat one recipe; row 6 is the best; row 3 has a blank target.
const SHEET = csv(`
CarbonSource,Gly,SP,Titer
src_14,9.6,2.2,25.9
src_10,0.4,2.6,31.1
src_10,5.2,4.5,
src_14,9.6,2.2,28.0
src_10,0.4,2.7,12.4
src_4,3.3,3.3,40.0
`);
const profile = profileSheet(SHEET);

function bodyRows(): HTMLElement[] {
  const body = document.querySelector("tbody")!;
  return within(body).getAllByRole("row");
}
const rowNumber = (tr: HTMLElement) => within(tr).getAllByRole("cell")[0].querySelector("span > span:last-child")!.textContent!;

describe("DataTable", () => {
  it("puts the name in code and the role in plain words under every header, numerics right-aligned", () => {
    const t = tableRows(profile, "Titer");
    render(<DataTable columns={t.columns} rows={t.rows} target="Titer" />);
    const heads = screen.getAllByRole("columnheader");
    expect(heads.map((h) => h.textContent)).toEqual(["Row", "CarbonSourceInput", "GlyInput", "SPInput", "TiterTarget"]);
    expect(heads[1].className).not.toMatch(/text-right/);
    expect(heads[4].className).toMatch(/text-right/);
    expect(heads[4].getAttribute("aria-sort")).toBe("descending");
    expect(heads[1].querySelector(".font-mono")?.textContent).toBe("CarbonSource");
  });

  it("sorts the target descending by default, pins the best row first with a Best badge and shows it in its place too", () => {
    const t = tableRows(profile, "Titer");
    render(<DataTable columns={t.columns} rows={t.rows} target="Titer" />);
    const rows = bodyRows();
    expect(rows.map(rowNumber)).toEqual(["6", "6", "2", "4", "1", "5", "3"]);
    expect(within(rows[0]).getByText("Best")).toBeTruthy();
    expect(within(rows[1]).getByText("Best")).toBeTruthy();
    expect(screen.getAllByText("Best")).toHaveLength(2);
  });

  it("keeps replicates adjacent when sorted by the target and captions them", () => {
    const t = tableRows(profile, "Titer");
    render(<DataTable columns={t.columns} rows={t.rows} target="Titer" />);
    const rows = bodyRows().slice(1);
    expect(rows.map(rowNumber)).toEqual(["6", "2", "4", "1", "5", "3"]);
    expect(within(rows[2]).getByText("replicate x2")).toBeTruthy();
    expect(within(rows[3]).getByText("replicate x2")).toBeTruthy();
    expect(screen.getAllByText("replicate x2")).toHaveLength(2);
  });

  it("sorts another column ascending on the first click without reordering replicates, and keeps the best pinned", () => {
    const t = tableRows(profile, "Titer");
    render(<DataTable columns={t.columns} rows={t.rows} target="Titer" />);
    fireEvent.click(within(screen.getAllByRole("columnheader")[3]).getByRole("button"));
    expect(screen.getAllByRole("columnheader")[3].getAttribute("aria-sort")).toBe("ascending");
    const rows = bodyRows();
    expect(rowNumber(rows[0])).toBe("6");
    expect(rows.slice(1).map(rowNumber)).toEqual(["1", "4", "2", "5", "6", "3"]);
  });

  it("filters by any cell and by a level, and counts what is shown", () => {
    const t = tableRows(profile, "Titer");
    render(<DataTable columns={t.columns} rows={t.rows} target="Titer" />);
    expect(screen.getByText("6 of 6 rows")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter rows"), { target: { value: "src_1" } });
    expect(screen.getByText("5 of 6 rows")).toBeTruthy();
    expect(bodyRows().map(rowNumber)).toEqual(["2", "4", "1", "5", "3"]);
    expect(screen.queryByText("Best")).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter rows"), { target: { value: "nothing here" } });
    expect(screen.getByText("0 of 6 rows")).toBeTruthy();
    expect(screen.getByText("No rows match the filter.")).toBeTruthy();
    expect(screen.getByLabelText("Level of CarbonSource")).toBeTruthy();
  });

  it("shows an origin badge per row only when some row has an origin", () => {
    const plain = tableRows(profile, "Titer");
    const { unmount } = render(<DataTable columns={plain.columns} rows={plain.rows} target="Titer" />);
    expect(screen.queryByText("Origin")).toBeNull();
    unmount();
    const t = tableRows(profile, "Titer", { extra: [{ values: { Gly: 1, SP: 2, Titer: 3 }, origin: "Round 1" }] });
    render(<DataTable columns={t.columns} rows={t.rows} target="Titer" />);
    expect(screen.getByText("Origin")).toBeTruthy();
    expect(screen.getByText("Round 1")).toBeTruthy();
    expect(screen.getAllByText("Sheet")).toHaveLength(7); // six sheet rows plus the pinned best
  });

  it("shows the sheet's own data_type column as origin words, not as a raw column", () => {
    const p = profileSheet(csv("data_type,SP,Titer\nreal,1.5,3\nsynthetic,2.5,4\nReal,3.5,5"));
    const t = tableRows(p, "Titer");
    render(<DataTable columns={t.columns} rows={t.rows} target="Titer" />);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Row", "SPInput", "TiterTarget", "Origin"]);
    expect(screen.getAllByText("Measured")).toHaveLength(3); // two rows plus the pinned best
    expect(screen.getByText("Synthetic")).toBeTruthy();
  });

  it("pages at 25 with the count line and the pager", () => {
    const big = csv(["SP,Titer", ...Array.from({ length: 60 }, (_, i) => `${i / 10},${(i * 7) % 61}`)].join("\n"));
    const t = tableRows(profileSheet(big), "Titer");
    render(<DataTable columns={t.columns} rows={t.rows} target="Titer" />);
    expect(screen.getByText("1-25 of 60")).toBeTruthy();
    expect(bodyRows()).toHaveLength(26); // the pinned best and one page
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(screen.getByText("26-50 of 60")).toBeTruthy();
  });

  it("says when the sheet has no rows", () => {
    const t = tableRows(profileSheet([["SP", "Titer"]]), "Titer");
    render(<DataTable columns={t.columns} rows={t.rows} target="Titer" />);
    expect(screen.getByText("This sheet has no run rows.")).toBeTruthy();
  });
});

// --- The round page, with the engine hooks and the route param stubbed --------------------------------------

const engine = vi.hoisted(() => ({ campaign: { data: null as unknown, error: false, status: "loading", refreshing: false, refresh: async () => {}, set: () => {} }, latest: { data: null as unknown, error: false, status: "loading", refreshing: false, refresh: async () => {}, set: () => {} }, round: "1" }));
vi.mock("@/hooks/use-engine", () => ({ useCampaign: () => engine.campaign, useLatest: () => engine.latest }));
vi.mock("next/navigation", () => ({ useParams: () => ({ round: engine.round }) }));

const { default: DataRoundPage } = await import("@/app/data/round/[round]/page");

const campaign = {
  has_campaign: true,
  target: "Titer",
  features: ["SP", "Gly"],
  n_base: 10,
  best: 63.3,
  round: 0,
  history: [{ round: 0, best: 63.3, n_base: 10 }],
  pending: [
    { id: "abcdef0123", recipe: { SP: 5.1, Gly: 2 }, pred: 60, std: 3, mode: "exploit", reason: "", result: 70.2, awaiting: false, round: 0 },
    { id: "0123456789", recipe: { SP: 4.1, Gly: 1 }, pred: 55, std: 3, mode: "explore", reason: "", result: null, awaiting: true, round: 0 },
  ],
  n_awaiting: 1,
  n_measured: 1,
};
const latest = { has_data: true, n: 10, d: 2, target: "Titer", features: ["SP", "Gly"], dataset: "pichia.csv", updated: 0, conformal_q: 7.05, conformal_coverage: 0.9, run: { input_sha256: "abc" } };

describe("DataRoundPage", () => {
  it("lists the round's runs with recipe, prediction and band, measurement, status and origin, under one verdict", () => {
    engine.campaign = { ...engine.campaign, data: campaign, status: "data" };
    engine.latest = { ...engine.latest, data: latest, status: "data" };
    engine.round = "1";
    render(<DataRoundPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Round 1");
    expect(screen.getByText("1 run measured, 1 awaiting. Started from pichia.csv.")).toBeTruthy();
    expect(screen.getByText("Best measured in this round: 70.20, above the sheet's best 63.30.")).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Run", "SP", "Gly", "Predicted", "Measured", "Status", "Origin"]);
    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("abcdef0")).toBeTruthy();
    expect(within(rows[0]).getByText("± 7.05 (90% band)")).toBeTruthy();
    expect(within(rows[0]).getByText("Measured")).toBeTruthy();
    expect(within(rows[1]).getByText("not yet")).toBeTruthy();
    expect(within(rows[1]).getByText("Awaiting")).toBeTruthy();
    expect(screen.getAllByText("Round 1")).toHaveLength(3); // the title and one origin badge per run
  });

  it("says when the engine folded the round and no longer lists its runs", () => {
    engine.campaign = { ...engine.campaign, data: { ...campaign, round: 1, pending: [], history: [...campaign.history, { round: 1, best: 70.2, n_base: 12 }] }, status: "data" };
    engine.round = "1";
    render(<DataRoundPage />);
    expect(screen.getByText("The engine folded round 1 into the campaign's data and no longer lists its runs")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says when a round was never recorded, and when the address is not a round", () => {
    engine.campaign = { ...engine.campaign, data: campaign, status: "data" };
    engine.round = "4";
    const { unmount } = render(<DataRoundPage />);
    expect(screen.getByText("Round 4 has not been recorded")).toBeTruthy();
    unmount();
    engine.round = "x";
    render(<DataRoundPage />);
    expect(screen.getByText("No such round")).toBeTruthy();
  });

  it("shows a connection failure as an error, never as an empty round", () => {
    engine.campaign = { ...engine.campaign, data: null, error: true, status: "error" };
    engine.round = "1";
    render(<DataRoundPage />);
    expect(screen.getByRole("alert").textContent).toMatch(/Could not reach the engine/);
  });
});
