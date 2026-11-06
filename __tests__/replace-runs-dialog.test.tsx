// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplaceRunsDialog } from "@/components/campaign/replace-runs-dialog";
import { CampaignHasRunsError, type CampaignRun } from "@/lib/api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/*
 * First-time study, F14: the replace dialog says what really happens (Kalos drops the runs, the earlier
 * sheet stays in the browser's Data list) and offers the export it used to ask for.
 */

const runs: CampaignRun[] = [
  { id: "a1", recipe: { SP: 9, Met: 8 }, pred: 110, std: 1, mode: "exploit", reason: "", result: 98.5, awaiting: false },
  { id: "b2", recipe: { SP: 4, Met: 2 }, pred: 44, std: 1, mode: "explore", reason: "", result: null, awaiting: true },
];

describe("ReplaceRunsDialog", () => {
  it("says the runs are dropped and the earlier sheet kept, and copies the runs as a table", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<ReplaceRunsDialog refusal={new CampaignHasRunsError(1, 1)} runs={runs} inputs={["SP", "Met"]} target="Titer" onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(await screen.findByText(/Kalos drops this campaign's 1 run waiting for a result and 1 measured run/)).toBeTruthy();
    expect(screen.getByText(/The sheet you uploaded earlier stays in this browser's Data list, but the recorded runs are not kept anywhere/)).toBeTruthy();
    expect(screen.queryByText(/Export them first/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy as a table" }));
    await screen.findByText("Copied");
    expect(writeText).toHaveBeenCalledWith(["Recipe\tSP\tMet\tPredicted Titer\tMeasured Titer", "P1\t9\t8\t110\t98.5", "P2\t4\t2\t44\t"].join("\n"));
    expect(screen.getByRole("button", { name: "Download as CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Drop the runs and upload" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep the runs (cancel)" })).toBeTruthy();
  });
});
