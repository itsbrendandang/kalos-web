import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { averageRanks, etaSquared, rankInputs, spearman, strengthWord } from "@/components/campaign/data/association";
import { profileSheet } from "@/components/campaign/data/profile";

const csv = (text: string) => text.trim().split("\n").map((l) => l.split(","));
const sample = (name: string) => `${homedir()}/Desktop/kalos-samples/${name}`;

describe("spearman", () => {
  it("gives ties the average of the ranks they span", () => {
    expect(averageRanks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(averageRanks([5, 5, 5])).toEqual([2, 2, 2]);
  });
  it("is 1 for any increasing relation, -1 for a decreasing one, and near 0 for none", () => {
    expect(spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 12);
    expect(Math.abs(spearman([1, 2, 3, 4, 5, 6], [3, 1, 4, 1, 5, 2])!)).toBeLessThan(0.5);
  });
  it("matches the textbook tie-corrected value", () => {
    // xs has a tie at 2: ranks 1, 2.5, 2.5, 4, 5; ys ranks 1..5 -> Pearson on ranks.
    expect(spearman([1, 2, 2, 3, 4], [1, 2, 3, 4, 5])).toBeCloseTo(0.9747, 3);
  });
  it("is null with fewer than three pairs or a constant side", () => {
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([3, 3, 3], [1, 2, 3])).toBeNull();
  });
});

describe("etaSquared", () => {
  it("is 1 when every level has one value and 0 when the levels share a mean", () => {
    expect(etaSquared(["A", "A", "B", "B"], [1, 1, 5, 5])).toBeCloseTo(1, 12);
    expect(etaSquared(["A", "A", "B", "B"], [1, 5, 1, 5])).toBeCloseTo(0, 12);
  });
  it("is the between-level share of the total sum of squares", () => {
    // A: 1, 3 (mean 2); B: 5, 7 (mean 6); grand mean 4. Between = 2*4 + 2*4 = 16, total = 9+1+1+9 = 20.
    expect(etaSquared(["A", "A", "B", "B"], [1, 3, 5, 7])).toBeCloseTo(0.8, 12);
  });
  it("is null when the target does not vary", () => {
    expect(etaSquared(["A", "B"], [2, 2])).toBeNull();
  });
});

describe("rankInputs", () => {
  const p = profileSheet(
    csv(`
up,down,noise,flat,cat,y
1,9,3,7.001,A,10
2,8,1,7.002,A,20
3,7,4,7.003,B,30
4,5,1,7.001,B,40
5,6,5,7.002,C,50
6,4,9,7.003,C,60
`),
  );

  it("sorts by strength, keeps the signed rho, and puts the nearly constant input last", () => {
    const r = rankInputs(p, "y", ["noise", "flat", "up", "down", "cat"]);
    expect(r.map((x) => x.name)).toEqual(["up", "cat", "down", "noise", "flat"]);
    expect(r[0]).toMatchObject({ kind: "numeric", strength: 1, rho: 1, nearlyConstant: false, n: 6 });
    expect(r[1]).toMatchObject({ kind: "category", nearlyConstant: false });
    expect(r[1].rho).toBeUndefined();
    expect(r[2].rho).toBeLessThan(-0.9);
    expect(r[4]).toMatchObject({ name: "flat", nearlyConstant: true });
    expect(strengthWord(r[0], 0)).toBe("went most with the target");
    expect(strengthWord(r[1], 1)).toBe("weaker");
    expect(strengthWord(r[4], 4)).toBe("nearly constant");
  });

  it("accepts column profiles as well as names, and skips names not in the sheet", () => {
    const cols = p.columns.filter((c) => c.name === "up" || c.name === "down");
    expect(rankInputs(p, "y", cols).map((x) => x.name)).toEqual(["up", "down"]);
    expect(rankInputs(p, "y", ["nope", "up"]).map((x) => x.name)).toEqual(["up"]);
  });

  it("reports a null strength with fewer than five paired runs", () => {
    const small = profileSheet(csv(`x,y\n1,1\n2,2\n3,3\n4,4`));
    expect(rankInputs(small, "y", ["x"])).toEqual([{ name: "x", kind: "numeric", strength: null, nearlyConstant: false, n: 4 }]);
  });

  it.skipIf(!existsSync(sample("pichia_HSA.csv")))("on pichia HSA, SP has the strongest association with Titer and CarbonSource ranks as a category", () => {
    const sheet = profileSheet(csv(readFileSync(sample("pichia_HSA.csv"), "utf8")));
    const r = rankInputs(sheet, "Titer", ["CarbonSource", "Carbon_conc", "Gly", "Met", "SP"]);
    expect(r[0].name).toBe("SP");
    expect(r[0].rho).toBeGreaterThan(0.5);
    expect(r.find((x) => x.name === "CarbonSource")).toMatchObject({ kind: "category" });
    expect(r.every((x) => x.strength != null)).toBe(true);
  });

  it.skipIf(!existsSync(sample("cho_bioreactor_20829178.csv")))("on the CHO sheet, pH sorts last as nearly constant", () => {
    const sheet = profileSheet(csv(readFileSync(sample("cho_bioreactor_20829178.csv"), "utf8")));
    const inputs = sheet.columns.map((c) => c.name).filter((n) => n !== "IVCD_1e6_cells_h_mL");
    const r = rankInputs(sheet, "IVCD_1e6_cells_h_mL", inputs);
    expect(r[r.length - 1]).toMatchObject({ name: "pH", nearlyConstant: true });
  });
});
