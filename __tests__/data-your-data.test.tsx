// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { gapSentence } from "@/components/campaign/data/copy";
import { YourDataView } from "@/components/campaign/data/your-data";
import { profileSheet } from "@/components/campaign/data/profile";

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

  it("adds the target figures once the target is known: run order, distribution, one scatter per input", () => {
    const { container } = render(<YourDataView name="run.csv" state={ready} target="Titer" />);
    expect(container.querySelector('svg[aria-label^="Titer by row in the sheet: 5 values, 6 rows."]')).toBeTruthy();
    expect(container.querySelectorAll('svg[aria-label^="Titer against"]').length).toBe(4);
    expect(screen.getByText("No replicates: no two runs share every input value, so run-to-run spread cannot be measured from this sheet.")).toBeTruthy();
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

describe("gapSentence", () => {
  it("says the range is covered when no stretch is untested", () => {
    expect(gapSentence([], { min: 0, max: 10 })).toBe("Runs cover the range with no stretch wider than a tenth of it untested.");
  });
  it("names up to three untested stretches and counts the rest", () => {
    const gap = (from: number, to: number) => ({ from, to, width: to - from, share: 0.2 });
    expect(gapSentence([gap(1, 2), gap(3, 4)], { min: 0, max: 10 })).toBe("Untested: no runs between 1 to 2, 3 to 4.");
    expect(gapSentence([gap(1, 2), gap(3, 4), gap(5, 6), gap(7, 8)], { min: 0, max: 10 })).toBe("Untested: no runs between 1 to 2, 3 to 4, 5 to 6, and 1 more.");
  });
  it("says there is no range to test for a single value", () => {
    expect(gapSentence([], null)).toBe("Only one value in this sheet, so no range to test.");
  });
});
