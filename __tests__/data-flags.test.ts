import { describe, expect, it } from "vitest";
import { dataFlags } from "@/components/campaign/data/flags";
import { profileSheet } from "@/components/campaign/data/profile";

const sheet = (text: string) => profileSheet(text.trim().split("\n").map((l) => l.split(",")));
const texts = (text: string) => dataFlags(sheet(text)).map((f) => f.text);

describe("dataFlags", () => {
  it("returns nothing for a clean sheet", () => {
    expect(texts("x,y\n1.5,2\n3.5,4\n5.5,7")).toEqual([]);
  });

  it("names blanks with the run count and the sheet size", () => {
    expect(texts("x,y\n1.5,\n2.5,3\n3.5,4")).toEqual(["y is blank in 1 run of 3."]);
  });

  it("calls out a constant column and says it cannot tell runs apart", () => {
    expect(texts("x,k\n1.5,A\n2.5,A\n3.5,A")).toEqual(["k is A in every run, so it cannot tell runs apart."]);
  });

  it("flags a headerless column that is unique per run as a possible run number", () => {
    const t = texts(",x,y\n0,1.5,5\n1,2.5,6\n2,3.5,7\n3,4.5,8");
    expect(t).toContain("column 1 has no header in the sheet.");
    expect(t).toContain("column 1 is different in every run, so it may be a run number or label rather than an input.");
  });

  it("reports repeated rows and identical columns", () => {
    expect(texts("a,b\n1,3\n1,3\n2,4")).toEqual(["1 run repeats an earlier run exactly."]);
    expect(texts("a,b,c\n1,1,3\n1,1,5\n2,2,9")).toEqual(["a and b hold identical values in every run."]);
  });

  it("says a mostly numeric column holds non-numbers, without flagging free text", () => {
    const mostly = texts("a\n1\n2\n3\n4\n<LOD\n6");
    expect(mostly).toEqual(["a is mostly numbers, but 1 entry is not a number, so it is not treated as a number here."]);
    expect(texts("note\nok\nfine\nlater")).toEqual([]);
  });
});
