import { describe, expect, it } from "vitest";
import {
  dataTypeCounts,
  dataTypeCountsFromRows,
  formatElapsed,
  parseDelimited,
} from "@/lib/sheet-columns";

describe("parseDelimited", () => {
  it("splits comma-separated values", () => {
    expect(parseDelimited("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("splits tab-separated values (TSV)", () => {
    expect(parseDelimited("a\tb\tc\n1\t2\t3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("prefers comma when both , and \\t are present", () => {
    // Header has both, but comma wins
    expect(parseDelimited("a,b\tc\n1,2\t3")).toEqual([
      ["a", "b\tc"],
      ["1", "2\t3"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseDelimited('a,b,c\n"hello, world",2,3')).toEqual([
      ["a", "b", "c"],
      ["hello, world", "2", "3"],
    ]);
  });

  it("handles escaped doubled quotes inside quoted fields", () => {
    expect(parseDelimited('a,b,c\n"said ""hi""",2,3')).toEqual([
      ["a", "b", "c"],
      [`said "hi"`, "2", "3"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseDelimited("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles bare \\r line endings", () => {
    expect(parseDelimited("a,b\r1,2\r")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles LF line endings (Unix)", () => {
    expect(parseDelimited("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a leading BOM (\\uFEFF)", () => {
    expect(parseDelimited("\uFEFFa,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("skips blank rows", () => {
    expect(parseDelimited("a,b\n\n1,2\n\n\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("dataTypeCountsFromRows", () => {
  it("returns null when fewer than 2 rows", () => {
    expect(dataTypeCountsFromRows([])).toBeNull();
    expect(dataTypeCountsFromRows([["a", "b"]])).toBeNull();
  });

  it("returns null when no data_type column exists", () => {
    expect(
      dataTypeCountsFromRows([["name", "value"], ["x", "1"]])
    ).toBeNull();
  });

  it("finds data_type column case-insensitively", () => {
    expect(
      dataTypeCountsFromRows([
        ["name", "Data_Type", "val"],
        ["x", "Real", "1"],
      ])
    ).toEqual({
      column: "Data_Type",
      total: 1,
      counts: [{ value: "Real", n: 1 }],
    });

    expect(
      dataTypeCountsFromRows([
        ["name", "DATA_TYPE", "val"],
        ["x", "Synthetic", "1"],
      ])
    ).toEqual({
      column: "DATA_TYPE",
      total: 1,
      counts: [{ value: "Synthetic", n: 1 }],
    });
  });

  it("finds 'data type' (space-separated variant)", () => {
    expect(
      dataTypeCountsFromRows([
        ["name", "data type", "val"],
        ["x", "Real", "1"],
      ])
    ).toEqual({
      column: "data type",
      total: 1,
      counts: [{ value: "Real", n: 1 }],
    });
  });

  it("finds 'data-type' (hyphen-separated variant)", () => {
    expect(
      dataTypeCountsFromRows([
        ["name", "data-type", "val"],
        ["x", "Synthetic", "1"],
      ])
    ).toEqual({
      column: "data-type",
      total: 1,
      counts: [{ value: "Synthetic", n: 1 }],
    });
  });

  it("counts values and sorts by count desc, value asc", () => {
    expect(
      dataTypeCountsFromRows([
        ["data_type", "val"],
        ["Real", "1"],
        ["Synthetic", "2"],
        ["Real", "3"],
        ["Synthetic", "4"],
        ["Synthetic", "5"],
      ])
    ).toEqual({
      column: "data_type",
      total: 5,
      counts: [
        { value: "Synthetic", n: 3 },
        { value: "Real", n: 2 },
      ],
    });
  });

  it("ties are broken by value ascending (localeCompare)", () => {
    expect(
      dataTypeCountsFromRows([
        ["data_type", "val"],
        ["Beta", "1"],
        ["Alpha", "2"],
      ])
    ).toEqual({
      column: "data_type",
      total: 2,
      counts: [
        { value: "Alpha", n: 1 },
        { value: "Beta", n: 1 },
      ],
    });
  });

  it("treats blank / whitespace-only cells as '(blank)'", () => {
    expect(
      dataTypeCountsFromRows([
        ["data_type", "val"],
        ["", "1"],
        ["   ", "2"],
        ["Real", "3"],
      ])
    ).toEqual({
      column: "data_type",
      total: 3,
      counts: [
        { value: "(blank)", n: 2 },
        { value: "Real", n: 1 },
      ],
    });
  });

  it("handles extra columns beyond data_type", () => {
    expect(
      dataTypeCountsFromRows([
        ["id", "data_type", "extra", "notes"],
        ["1", "Real", "x", "a"],
        ["2", "Synthetic", "y", "b"],
      ])
    ).toEqual({
      column: "data_type",
      total: 2,
      counts: [
        { value: "Real", n: 1 },
        { value: "Synthetic", n: 1 },
      ],
    });
  });

  it("handles rows with fewer columns than header (undefined -> blank)", () => {
    expect(
      dataTypeCountsFromRows([
        ["data_type", "other"],
        ["Real"],
      ])
    ).toEqual({
      column: "data_type",
      total: 1,
      counts: [{ value: "Real", n: 1 }],
    });
  });
});

describe("dataTypeCounts (text entry)", () => {
  it("parses text and delegates to dataTypeCountsFromRows", () => {
    const text =
      "name,data_type\nRun 1,Real\nRun 2,Synthetic\nRun 3,Real";
    expect(dataTypeCounts(text)).toEqual({
      column: "data_type",
      total: 3,
      counts: [
        { value: "Real", n: 2 },
        { value: "Synthetic", n: 1 },
      ],
    });
  });

  it("returns null when text has no header", () => {
    expect(dataTypeCounts("Real\nSynthetic")).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("formats minutes and zero-padded seconds", () => {
    expect(formatElapsed(65)).toBe("1:05");
    expect(formatElapsed(125)).toBe("2:05");
  });

  it("zero-pads single-digit seconds", () => {
    expect(formatElapsed(60)).toBe("1:00");
    expect(formatElapsed(1)).toBe("0:01");
    expect(formatElapsed(59)).toBe("0:59");
  });

  it("clamps negative values to 0:00", () => {
    expect(formatElapsed(-1)).toBe("0:00");
    expect(formatElapsed(-100)).toBe("0:00");
  });

  it("handles zero seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
  });

  it("handles large values", () => {
    expect(formatElapsed(3661)).toBe("61:01");
    expect(formatElapsed(3600)).toBe("60:00");
  });

  it("floors fractional seconds", () => {
    expect(formatElapsed(65.9)).toBe("1:05");
    expect(formatElapsed(65.1)).toBe("1:05");
  });
});
