import { describe, expect, it } from "vitest";
import { checkFillValue, detectProcedureAsk, draftBody, draftHeader, openPlaceholders, parseInline, parseMarkdown, placeholderLabel, placeholdersAgree, sopSourceHref, sopSourceLabel, templateLabel } from "@/lib/sop";

const HEADER = "> Draft prepared with Kalos from campaign records on 2026-05-01. Not reviewed. Not an approved procedure.";
const MD = `${HEADER}

# Run recipe 2 of round 1

## Materials
| Input | Value | Unit |
|---|---|---|
| SP | 6.57 | g/L |
| Met | **3.11** | g/L |

## Steps
1. Prepare the medium.
2. Run until [[TO FILL: run_duration_h]] hours have passed.

- Vessel: [[TO FILL: equipment_vessel_id]]
- Code \`BR-04\`
`;

describe("the header line", () => {
  it("is the first line, read from the blockquote, and left out of the body", () => {
    expect(draftHeader(MD)).toBe("Draft prepared with Kalos from campaign records on 2026-05-01. Not reviewed. Not an approved procedure.");
    expect(draftBody(MD).startsWith("# Run recipe 2 of round 1")).toBe(true);
    expect(draftHeader("# No header\n")).toBeNull();
    expect(draftBody("# No header\n")).toBe("# No header\n");
  });
});

describe("parseMarkdown", () => {
  const blocks = parseMarkdown(draftBody(MD));
  it("reads headings, a pipe table, numbered steps and bullets", () => {
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "heading", "table", "heading", "list", "list"]);
    const table = blocks[2];
    if (table.kind !== "table") throw new Error("expected a table");
    expect(table.header.map((c) => c[0])).toEqual([{ kind: "text", text: "Input" }, { kind: "text", text: "Value" }, { kind: "text", text: "Unit" }]);
    expect(table.rows[1][1]).toEqual([{ kind: "bold", text: "3.11" }]);
    const steps = blocks[4];
    if (steps.kind !== "list") throw new Error("expected a list");
    expect(steps.ordered).toBe(true);
    expect(steps.items[1]).toEqual([{ kind: "text", text: "Run until " }, { kind: "placeholder", name: "run_duration_h" }, { kind: "text", text: " hours have passed." }]);
    const bullets = blocks[5];
    if (bullets.kind !== "list") throw new Error("expected a list");
    expect(bullets.ordered).toBe(false);
    expect(bullets.items[1]).toEqual([{ kind: "text", text: "Code " }, { kind: "code", text: "BR-04" }]);
  });
  it("never reads HTML as anything but text", () => {
    const [p] = parseMarkdown("<script>alert(1)</script> and <b>bold</b>");
    expect(p).toEqual({ kind: "paragraph", inline: [{ kind: "text", text: "<script>alert(1)</script> and <b>bold</b>" }] });
  });
  it("joins wrapped paragraph lines and keeps the header as a quote when asked to", () => {
    expect(parseMarkdown("one\ntwo\n\nthree")).toEqual([
      { kind: "paragraph", inline: [{ kind: "text", text: "one two" }] },
      { kind: "paragraph", inline: [{ kind: "text", text: "three" }] },
    ]);
    expect(parseMarkdown(HEADER)[0].kind).toBe("quote");
  });
  it("parses inline marks in order", () => {
    expect(parseInline("a **b** `c` [[TO FILL: d_e]] f")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", text: "b" },
      { kind: "text", text: " " },
      { kind: "code", text: "c" },
      { kind: "text", text: " " },
      { kind: "placeholder", name: "d_e" },
      { kind: "text", text: " f" },
    ]);
  });
});

describe("placeholders", () => {
  it("lists the open ones once each, in order, and names them in plain words", () => {
    expect(openPlaceholders(MD)).toEqual(["run_duration_h", "equipment_vessel_id"]);
    expect(placeholderLabel("acceptance_limit_titer")).toBe("Acceptance limit titer");
  });
  it("trusts the engine's list only when it matches the text", () => {
    expect(placeholdersAgree({ markdown: MD, placeholders: [{ name: "equipment_vessel_id", section: "", why: "" }, { name: "run_duration_h", section: "", why: "" }] })).toBe(true);
    expect(placeholdersAgree({ markdown: MD, placeholders: [{ name: "run_duration_h", section: "", why: "" }] })).toBe(false);
  });
  it("checks a typed value the way the engine will", () => {
    expect(checkFillValue("BR-04")).toBeNull();
    expect(checkFillValue("  ")).toBe("Type a value first.");
    expect(checkFillValue("a\nb")).toBe("One line only.");
    expect(checkFillValue("[[x]]")).toBe("Square brackets are not allowed here.");
    expect(checkFillValue("x".repeat(501))).toBe("Keep it under 500 characters.");
  });
});

describe("sources and templates", () => {
  const SHA = "c".repeat(64);
  it("links each record kind to its page and names it plainly", () => {
    expect(sopSourceHref("run:0123456789abcdef")).toBe("/campaign/run");
    expect(sopSourceHref("proposal:1.1")).toBe("/campaign/plan");
    expect(sopSourceHref("analysis:feature_ranges")).toBe("/campaign/learn");
    expect(sopSourceHref(`sheet:${SHA}`)).toBe(`/data/sheet/${SHA}`);
    expect(sopSourceHref("sheet:../x")).toBe("/data");
    expect(sopSourceHref("round:1")).toBe("/data/round/2");
    expect(sopSourceLabel("round:1")).toBe("Round 2");
    expect(sopSourceHref("other:1")).toBeNull();
    expect(sopSourceLabel("run:0123456789abcdef")).toBe("Run 0123456");
    expect(sopSourceLabel("proposal:0.1")).toBe("Recipe 2 of round 1");
    expect(sopSourceLabel("proposal:1.1")).toBe("Recipe 2 of round 2");
    expect(sopSourceLabel("analysis:feature_ranges")).toBe("Model results: feature ranges");
    expect(sopSourceLabel(`sheet:${SHA}`)).toBe("Sheet ccccccc");
  });
  it("names templates in plain words", () => {
    expect(templateLabel("batch_recipe")).toBe("Run a recipe");
    expect(templateLabel("media_prep")).toBe("Prepare media");
    expect(templateLabel("custom")).toBe("Blank");
    expect(templateLabel("something_else")).toBe("something else");
  });
});

describe("detectProcedureAsk", () => {
  it("recognises a request for a procedure and the round or recipe it names", () => {
    expect(detectProcedureAsk("write an SOP for round 2")).toEqual({ round: 2 });
    expect(detectProcedureAsk("Draft a protocol for recipe 3 please")).toEqual({ proposal: 2 });
    expect(detectProcedureAsk("can you make a procedure")).toEqual({});
  });
  it("leaves plain questions alone, even ones that mention a procedure", () => {
    expect(detectProcedureAsk("what was the best titer?")).toBeNull();
    expect(detectProcedureAsk("which SOP did round 2 follow?")).toBeNull();
  });
});
