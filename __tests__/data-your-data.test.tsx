// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { gapSentence } from "@/components/campaign/data/copy";
import { splitTop, YourDataView } from "@/components/campaign/data/your-data";
import { profileSheet } from "@/components/campaign/data/profile";
import type { InputRank } from "@/components/campaign/data/association";

afterEach(cleanup);

// A small test fixture shaped like a run sheet with a blank-header row number, a category and blanks.
const TEXT = [
  ",CarbonSource,Gly,SP,Titer",
  "0,14,9.6,2.2,25.9",
  "1,10,0.4,2.6,31.1",
  "2,,5.2,4.5,",
  "3,14,9.6,6.5,28.0",
  "4,10,1.1,1.0,12.4",
  "5,4,3.3,3.3,40.0",
].join("\n");
const profile = profileSheet(TEXT.split("\n").map((l) => l.split(",")));
const ready = { status: "ready" as const, profile, sheetUsed: null };

/** Opens the disclosure whose summary holds `text` (jsdom does not toggle <details> on a click). */
function open(summary: HTMLElement) {
  const details = summary.closest("details")!;
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
}

describe("YourDataView", () => {
  it("says it is reading while the file is read, and never shows a placeholder chart", () => {
    const { container } = render(<YourDataView name="run.csv" state={{ status: "loading" }} />);
    expect(screen.getByText("Reading the sheet…")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("names the file as the source and calls out the headerless row-number column", () => {
    render(<YourDataView name="run.csv" state={ready} />);
    expect(screen.getByText(/6 runs, 5 columns, read from this file in your browser/)).toBeTruthy();
    expect(screen.getByText("column 1 has no header in the sheet.")).toBeTruthy();
    expect(screen.getByText("column 1 is different in every run, so it may be a run number or label rather than a process input.")).toBeTruthy();
    expect(screen.getByText("CarbonSource is blank in 1 run of 6.")).toBeTruthy();
  });

  it("draws one figure per input before the engine has named a target, and waits for the target otherwise", () => {
    const { container } = render(<YourDataView name="run.csv" state={ready} />);
    expect(screen.getByText(/appear once the engine has read the sheet/)).toBeTruthy();
    expect(container.querySelectorAll('svg[aria-label^="Histogram of"]').length).toBe(5);
    expect(container.querySelectorAll('svg[aria-label^="Bar chart of"]').length).toBe(0);
    expect(container.querySelectorAll('svg[aria-label^="Titer by row"]').length).toBe(0);
  });

  it("adds the target figures once the target is known: run order, distribution, the strongest scatters, the rest one click down", () => {
    const { container } = render(<YourDataView name="run.csv" state={ready} target="Titer" />);
    expect(container.querySelector('svg[aria-label^="Titer by row in the sheet: 5 values, 6 rows."]')).toBeTruthy();
    expect(container.querySelector("polyline")).toBeNull();
    const shown = container.querySelectorAll('svg[aria-label^="Titer against"]').length;
    expect(shown).toBeGreaterThanOrEqual(1);
    expect(shown).toBeLessThanOrEqual(4);
    const more = screen.getByText(/more inputs? with weaker association/);
    expect(more.textContent).toBe(`${4 - shown} more ${4 - shown === 1 ? "input" : "inputs"} with weaker association`);
    open(more);
    expect(container.querySelectorAll('svg[aria-label^="Titer against"]').length).toBe(4);
    expect(screen.getByText("No replicates: no two runs share every input the engine used, so run-to-run spread cannot be measured from this sheet.")).toBeTruthy();
    // One sentence of meaning under every target figure.
    expect(screen.getByText(/^Best run: row \d+ at /)).toBeTruthy();
    expect(screen.getAllByText(/the fullest bin;/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/the best 3 runs/).length).toBe(4);
  });

  it("orders the inputs by their association with the target and captions the first as the strongest", () => {
    const { container } = render(<YourDataView name="run.csv" state={ready} target="Titer" />);
    const rows = Array.from(container.querySelectorAll("li p .text-caption"));
    expect(rows[0].textContent).toBe("strongest association");
    expect(rows.slice(1).every((r) => r.textContent === "weaker" || r.textContent === "nearly constant")).toBe(true);
    const names = Array.from(container.querySelectorAll("li p .font-mono")).map((e) => e.textContent);
    const scatters = Array.from(container.querySelectorAll('svg[aria-label^="Titer against"], svg[aria-label^="Titer by "]:not([aria-label*="by row"])')).map((s) => s.getAttribute("aria-label")!.match(/^Titer (?:against|by) (.+?):/)![1]);
    expect(names[0]).toBe(scatters[0]);
  });

  it("lists a nearly constant input by name only, with the reason, instead of a scatter", () => {
    const flat = profileSheet(
      ["pH,SP,Titer", "7.001,1,10", "7.002,2,20", "7.003,3,30", "7.001,4,40", "7.002,5,50", "7.003,6,60"].map((l) => l.split(",")),
    );
    const { container } = render(<YourDataView name="run.csv" state={{ status: "ready", profile: flat, sheetUsed: null }} target="Titer" />);
    expect(container.querySelectorAll('svg[aria-label^="Titer against pH"]').length).toBe(0);
    open(screen.getByText("1 more input with weaker association"));
    expect(screen.getByText(/pH is nearly constant \(7.001 to 7.003\), so this sheet cannot show its association with Titer\./)).toBeTruthy();
    expect(container.querySelectorAll('svg[aria-label^="Titer against pH"]').length).toBe(0);
  });

  it("keeps rows a data_type column marks as not measured out of every chart, and says so once", () => {
    const typed = profileSheet(
      ["SP,data_type,Titer", "1,real,10", "2,synthetic,99", "3,Real,30", "4,measured,40", "5,simulated,98", "6,real,60"].map((l) => l.split(",")),
    );
    const { container } = render(<YourDataView name="run.csv" state={{ status: "ready", profile: typed, sheetUsed: null }} target="Titer" />);
    expect(screen.getByText("2 of 6 rows are marked simulated (1), synthetic (1) in data_type, so they stay in the table and out of every chart; only the 4 runs marked measured are drawn.")).toBeTruthy();
    expect(container.querySelector('svg[aria-label^="Titer by row in the sheet: 4 values, 4 rows."]')).toBeTruthy();
    expect(container.querySelectorAll('svg[aria-label^="Bar chart of data_type"]').length).toBe(0);
    expect(container.querySelector("[data-best]")?.getAttribute("data-best")).toBe("60");
  });

  it("splits the sheet-order figure into one panel per row origin and leaves the facts out when asked", () => {
    const origins = [null, null, null, null, "Round 1", "Round 1"];
    render(<YourDataView name="run.csv" state={ready} target="Titer" rowOrigins={origins} hideFacts />);
    expect(screen.queryByText("column 1 has no header in the sheet.")).toBeNull();
    expect(screen.getByText("Round 1, n = 2")).toBeTruthy();
    expect(screen.getByText(/Round 1 added 2 runs; its best, 40, beat the sheet's best 31.1\./)).toBeTruthy();
  });

  it("charts only the engine's inputs once it has answered, and names the columns it did not use", () => {
    const { container } = render(<YourDataView name="run.csv" state={ready} target="Titer" engineInputs={["CarbonSource", "SP"]} />);
    expect(screen.getByText("Not used as inputs by the engine: column 1, Gly.")).toBeTruthy();
    // Two input histograms plus the target's own distribution; one scatter per input once the disclosure is open.
    expect(container.querySelectorAll('svg[aria-label^="Histogram of"]').length).toBe(3);
    const more = screen.queryByText(/more inputs? with weaker association/);
    if (more) open(more);
    expect(container.querySelectorAll('svg[aria-label^="Titer against"]').length).toBe(2);
  });

  it("says when the engine fitted fewer rows than the sheet holds", () => {
    render(<YourDataView name="run.csv" state={ready} target="Titer" engineRuns={5} />);
    expect(screen.getByText(/The engine fitted/).textContent).toContain("5 of these 6 rows");
  });

  it("states plainly when the file could not be read in the browser", () => {
    render(<YourDataView name="old.xls" state={{ status: "unreadable", reason: "unreadable" }} />);
    expect(screen.getByText(/legacy .xls files are not supported here/)).toBeTruthy();
    cleanup();
    render(<YourDataView name="big.csv" state={{ status: "unreadable", reason: "too-large" }} />);
    expect(screen.getByText(/over 5 MB/)).toBeTruthy();
  });

  it("never uses a regulated or outcome word", () => {
    const { container } = render(<YourDataView name="run.csv" state={ready} target="Titer" engineRuns={5} />);
    const text = container.textContent ?? "";
    for (const w of ["compliant", "validated", "design space", "signed", "tamper", "safe", "recommend", "stop", "continue", "uppercase"]) {
      expect(text.toLowerCase()).not.toContain(w);
    }
  });
});

describe("splitTop", () => {
  const rank = (name: string, strength: number | null, nearlyConstant = false): { rank: InputRank } => ({ rank: { name, kind: "numeric", strength, nearlyConstant, n: 20 } });
  it("shows the inputs at or above 0.3, at most four, and the rest one click down", () => {
    const all = [rank("a", 0.9), rank("b", 0.6), rank("c", 0.5), rank("d", 0.4), rank("e", 0.35), rank("f", 0.1)];
    const { top, rest } = splitTop(all);
    expect(top.map((o) => o.rank.name)).toEqual(["a", "b", "c", "d"]);
    expect(rest.map((o) => o.rank.name)).toEqual(["e", "f"]);
  });
  it("always shows at least one input, and never a nearly constant one", () => {
    expect(splitTop([rank("a", 0.1), rank("b", 0.05)]).top.map((o) => o.rank.name)).toEqual(["a"]);
    expect(splitTop([rank("flat", 0.9, true), rank("b", 0.05)]).top.map((o) => o.rank.name)).toEqual(["b"]);
    expect(splitTop([rank("a", null)]).top.map((o) => o.rank.name)).toEqual(["a"]);
  });
});

describe("gapSentence", () => {
  it("says the range is covered when no stretch is untested", () => {
    expect(gapSentence([], { min: 0, max: 10 })).toBe("Runs cover the range with no stretch wider than a tenth of it untested.");
  });
  it("names up to three untested stretches and counts the rest", () => {
    const gap = (from: number, to: number) => ({ from, to, width: to - from, share: 0.2 });
    expect(gapSentence([gap(1, 2), gap(3, 4)], { min: 0, max: 10 })).toBe("Untested: no runs between 1 to 2, 3 to 4.");
    expect(gapSentence([gap(1, 2), gap(3, 4), gap(5, 6), gap(7, 8)], { min: 0, max: 10 })).toBe("Untested: no runs between 1 to 2, 3 to 4, 5 to 6, and 1 more.");
  });
  it("shows more digits when both ends of a stretch would otherwise read the same", () => {
    expect(gapSentence([{ from: 36.995, to: 37.004, width: 0.009, share: 0.3 }], { min: 36.98, max: 37.01 })).toBe("Untested: no runs between 36.995 to 37.004.");
  });
  it("says there is no range to test for a single value", () => {
    expect(gapSentence([], null)).toBe("Only one value in this sheet, so no range to test.");
  });
});
