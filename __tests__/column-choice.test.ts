import { describe, expect, it } from "vitest";
import { profileSheet } from "@/components/campaign/data/profile";
import { buildLabel, defaultInputs, describeColumn, describeColumns, guessTarget, rolesFor } from "@/lib/column-choice";

/*
 * The one decision on Setup, worked out in the browser from the dropped file (first-time study, F6):
 * which column to raise, which columns Kalos may change, and what every other column is.
 */

const sheet = (text: string) => profileSheet(text.trim().split("\n").map((l) => l.split(",")));

// The persona's "messy sheet" (task D): a row number, a strain, a blank header, Titer in the middle, notes.
const MESSY = sheet(`
Row,Strain,Glucose_gL,Titer,,Temp_C,Notes
1,WT,20,10.1,a,30,late induction
2,WT,25,12.0,b,30,
3,clone7,30,15.5,c,32,foam
4,clone7,20,11.2,a,32,
5,dPEP4,25,13.8,b,30,ok
6,dPEP4,30,16.1,c,32,
7,WT,20,10.5,a,30,
8,clone7,25,14.0,b,32,
9,dPEP4,30,15.9,c,30,
10,WT,25,12.3,a,32,
11,clone7,20,11.0,b,30,
12,dPEP4,25,14.2,c,32,
`);

describe("guessTarget", () => {
  it("prefers a column named like titer or yield, whatever its position", () => {
    expect(guessTarget(MESSY)).toBe("Titer");
  });
  it("falls back to the last number column that varies, never a row number", () => {
    const p = sheet("Row,pH,temp,biomass_g_L\n1,6,30,2.5\n2,7,31,3.1\n3,6.5,30,4.2\n4,6,31.5,2.2");
    expect(guessTarget(p)).toBe("biomass_g_L");
    const q = sheet("Row,pH,temp\n1,6,30\n2,7,31\n3,6.5,30\n4,6,31.5");
    expect(guessTarget(q)).toBe("temp");
  });
  it("is null when no number column varies", () => {
    expect(guessTarget(sheet("name,note\na,x\nb,y"))).toBeNull();
  });
});

describe("describeColumns", () => {
  const choices = describeColumns(MESSY, "Titer");
  const by = Object.fromEntries(choices.map((c) => [c.name, c]));

  it("ticks the settings by default: numbers that vary and a short choice of labels", () => {
    expect(by.Glucose_gL.suggested).toBe("input");
    expect(by.Temp_C.suggested).toBe("input");
    expect(by.Strain.suggested).toBe("input");
    expect(by.Strain.categorical).toBe(true);
    expect([...defaultInputs(choices)].sort()).toEqual(["Glucose_gL", "Strain", "Temp_C"]);
  });
  it("leaves out the row number, the blank header and the notes, each with its reason", () => {
    expect(by.Row).toMatchObject({ suggested: "left-out", reason: "counts the rows" });
    expect(by["column 5"]).toMatchObject({ suggested: "left-out", reason: "no header, so it cannot be named" });
    expect(by.Notes).toMatchObject({ suggested: "left-out", reason: "named like a run label or date" });
    const notes = describeColumns(sheet("x,comment,y\n1,late induction,2\n2,foam,3\n3,ok,5\n4,checked twice,6"), "y").find((c) => c.name === "comment")!;
    expect(notes).toMatchObject({ suggested: "left-out", reason: "differs in nearly every run, like a label or a note" });
  });
  it("names the target and says what each column holds in the lab's words", () => {
    expect(by.Titer).toMatchObject({ suggested: "target", canBeInput: false });
    expect(by.Glucose_gL.what).toBe("numbers, 20 to 30");
    expect(by.Strain.what).toBe("a choice of 3 labels: clone7, dPEP4, WT");
    expect(by.Row.what).toBe("row numbers 1 to 12");
    expect(by.Notes.what).toMatch(/blank in 9 runs/);
  });
  it("leaves out a column that looks like a measured result, one that barely changes, and a text column with too many labels", () => {
    const rows = Array.from({ length: 24 }, (_, i) => `${6 + (i % 3) / 2},${(i * 7) % 11},${100 + (i % 2) / 10},${["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"][i % 12]},${(i * 13) % 17},${i + 1}`);
    const p = sheet(["pH,OD600,const,src,Titer,Row", ...rows].join("\n"));
    const c = Object.fromEntries(describeColumns(p, "Titer").map((x) => [x.name, x]));
    expect(c.OD600).toMatchObject({ suggested: "left-out", reason: "looks like a measured result, not a setting", canBeInput: true });
    expect(c.const).toMatchObject({ suggested: "left-out", reason: "barely changes across the runs", canBeInput: true, canBeTarget: false });
    expect(c.src.reason).toBe("12 different labels: too few runs per label to learn from");
    expect(c.pH.suggested).toBe("input");
  });
  it("a column with no values can be neither input nor target", () => {
    const p = sheet("a,b,y\n1,,2\n2,,3\n3,,5");
    const c = Object.fromEntries(describeColumns(p, "y").map((x) => [x.name, x]));
    expect(c.b).toMatchObject({ suggested: "left-out", reason: "no values", canBeInput: false, canBeTarget: false });
    expect(describeColumn(p.columns[1], p.n)).toBe("no values");
  });
});

describe("rolesFor", () => {
  it("sends the target, the ticked inputs in sheet order, and which of them are label choices", () => {
    const choices = describeColumns(MESSY, "Titer");
    expect(rolesFor(choices, "Titer", new Set(["Temp_C", "Strain", "Glucose_gL"]))).toEqual({
      target: "Titer",
      features: ["Strain", "Glucose_gL", "Temp_C"],
      categoricals: ["Strain"],
    });
    expect(rolesFor(choices, "Titer", new Set(["Glucose_gL"]))).toEqual({ target: "Titer", features: ["Glucose_gL"] });
  });
  it("never lists the target as an input", () => {
    const choices = describeColumns(MESSY, "Glucose_gL");
    expect(rolesFor(choices, "Glucose_gL", new Set(["Glucose_gL", "Temp_C"])).features).toEqual(["Temp_C"]);
  });
});

describe("buildLabel", () => {
  it("says what the button does, with the count", () => {
    expect(buildLabel(3, false)).toBe("Build the model with these 3 inputs");
    expect(buildLabel(1, false)).toBe("Build the model with this input");
    expect(buildLabel(2, true)).toBe("Build the model again with these 2 inputs");
  });
});
