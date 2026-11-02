import { describe, expect, it } from "vitest";
import { extractParams, mabTemplate, parseStored, stepHealth, summarize } from "@/lib/process";

describe("extractParams", () => {
  const sop = `SOP-104 Production bioreactor
Version 3
1. pH 6.8 - 7.2
2. Temperature: 36.5 ± 0.5 °C
Agitation = 120 rpm
Dissolved oxygen: 30 to 60 %
Feed rate 0.5–2 mL/h
Operator signs the batch record.
Step 4`;
  const r = extractParams(sop);
  const by = (n: string) => r.find((x) => x.name.toLowerCase() === n)!;
  it("reads ranges, plus/minus and single values", () => {
    expect(by("ph")).toMatchObject({ low: 6.8, high: 7.2 });
    expect(by("temperature")).toMatchObject({ low: 36, high: 37, unit: "°C" });
    expect(by("agitation")).toMatchObject({ low: 120, high: 120, unit: "rpm" });
    expect(by("dissolved oxygen")).toMatchObject({ low: 30, high: 60, unit: "%" });
    expect(by("feed rate")).toMatchObject({ low: 0.5, high: 2, unit: "mL/h" });
  });
  it("ignores prose, headings and version lines", () => {
    expect(r.map((x) => x.name.toLowerCase())).not.toContain("version");
    expect(r.length).toBe(5);
  });
  it("de-duplicates repeated lines", () => expect(extractParams("pH 7 - 7.4\npH 7 - 7.4")).toHaveLength(1));
  it("returns nothing for empty text", () => expect(extractParams("")).toEqual([]));
});

describe("stepHealth and summarize", () => {
  const m = mabTemplate();
  it("is honest about empty steps", () => expect(stepHealth(m.steps[0]).state).toBe("empty"));
  it("asks for data when parameters exist", () => expect(stepHealth(m.steps[2]).state).toBe("needs-data"));
  it("counts steps, parameters and partners", () => {
    m.steps[2].owner = "cdmo";
    m.steps[2].partner = "Acme Bio";
    m.steps[2].data.push({ name: "x.csv", rows: 40, target: "titer", added: 1 });
    const s = summarize(m);
    expect(s.steps).toBe(10);
    expect(s.withData).toBe(1);
    expect(s.partners).toEqual(["Acme Bio"]);
    expect(stepHealth(m.steps[2])).toEqual({ state: "ready", label: "40 runs" });
  });
});

describe("parseStored", () => {
  it("rejects junk", () => {
    expect(parseStored(null)).toBeNull();
    expect(parseStored("{")).toBeNull();
    expect(parseStored('{"name":1}')).toBeNull();
  });
  it("round-trips", () => expect(parseStored(JSON.stringify(mabTemplate()))?.steps).toHaveLength(10));
});

import { matchColumns } from "@/lib/process";
describe("matchColumns", () => {
  it("reads mg/L, ug/mL and cell densities as units", () => {
    expect(extractParams("Glucose 2 - 6 mg/L")[0].unit).toBe("mg/L");
    expect(extractParams("Antibody 5 - 10 µg/mL")[0].unit).toBe("µg/mL");
    expect(extractParams("Seeding density: 0.3 - 0.5 cells/mL")[0].unit).toBe("cells/mL");
  });
  it("matches parameters to columns by name", () => {
    const m = mabTemplate().steps[2];
    const r = matchColumns(m.params, ["run_id", "pH", "temperature_C", "glucose_gL", "titer"]);
    expect(r.matched.map((x) => x.column)).toEqual(["pH", "temperature_C", "glucose_gL"]);
    expect(r.unmatchedColumns).toEqual(["run_id", "titer"]);
  });
});
