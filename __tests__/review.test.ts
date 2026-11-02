import { describe, expect, it } from "vitest";
import { exampleCourse, parseTimeCourse, review, statsOf } from "@/lib/review";

const ctx = { plate: "96" as const, volumeUl: 100, days: 35 };

describe("parseTimeCourse", () => {
  it("reads long format", () => {
    const p = parseTimeCourse("time,well,od\n0,A1,0.1\n1,A1,0.2\n2,A1,0.3\n0,A2,0.1\n1,A2,0.2\n2,A2,0.4")!;
    expect(p.series.map((s) => s.name)).toEqual(["A1", "A2"]);
    expect(p.series[0].y).toEqual([0.1, 0.2, 0.3]);
  });
  it("reads wide format", () => {
    const p = parseTimeCourse("hours,A1,A2\n0,1,1\n1,2,2\n2,3,2")!;
    expect(p.series).toHaveLength(2);
    expect(p.timeUnit).toBe("hours");
  });
  it("rejects what it cannot read", () => {
    expect(parseTimeCourse("hello")).toBeNull();
    expect(parseTimeCourse("a,b\nx,y\nz,w")).toBeNull();
  });
});

describe("statsOf", () => {
  it("finds the peak and the fall from it", () => {
    const s = statsOf({ name: "x", t: [0, 1, 2, 3], y: [0, 4, 2, 1] });
    expect(s).toMatchObject({ peak: 4, peakT: 1, final: 1 });
    expect(s.fallFrac).toBeCloseTo(0.75);
  });
});

describe("review", () => {
  const r = review(parseTimeCourse(exampleCourse())!, ctx);
  const by = (id: string) => r.findings.find((f) => f.id === id)!;
  it("sees a plate-wide rise and fall, and points away from handling", () => {
    expect(by("shared").verdict).toBe("supported");
    expect(by("handling").verdict).not.toBe("supported");
    expect(r.mine.verdict).toBe("unlikely");
  });
  it("sees the edge effect in the example", () => expect(by("evaporation").verdict).toBe("supported"));
  it("always states that one run is not proof", () => expect(r.caveat).toMatch(/not proof/));
  it("flags handling when replicates disagree wildly", () => {
    const rows = ["time,well,od"];
    for (let w = 0; w < 12; w++) for (let t = 0; t < 6; t++) rows.push(`${t},W${w},${(t * (w % 2 ? 0.1 : 1.2)).toFixed(2)}`);
    const q = review(parseTimeCourse(rows.join("\n"))!, { plate: "other", volumeUl: null, days: 3 });
    expect(q.findings.find((f) => f.id === "handling")!.verdict).toBe("supported");
    expect(q.mine.verdict).toBe("possible");
  });
});

import { chatContext, unusualWells } from "@/lib/review";
describe("chatContext and unusualWells", () => {
  const p = parseTimeCourse(exampleCourse())!;
  it("hands the model only facts, findings, setup and notes", () => {
    const c = chatContext(review(p, ctx), ctx, "added 100 uL medium");
    expect(c).toMatch(/^FACTS/);
    expect(c).toMatch(/NOTES from the scientist: added 100 uL medium/);
  });
  it("finds no odd wells in a tidy plate", () => expect(unusualWells(p).size).toBe(0));
});
