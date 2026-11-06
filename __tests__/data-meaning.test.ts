import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import * as meaning from "@/components/campaign/data/meaning";
import { consecutiveBlocks, histogram, measuredOnly, profileSheet, replicateGroups, replicateSpread, summarize } from "@/components/campaign/data/profile";

const csv = (text: string) => text.trim().split("\n").map((l) => l.split(","));
const sample = (name: string) => `${homedir()}/Desktop/kalos-samples/${name}`;
const BANNED = /\b(because|drives?|causes?|effect of|leads? to|improves?)\b/i;

describe("bestCount", () => {
  it("is a tenth of the runs, never below 3 (with 3 or more runs) and never above 10", () => {
    expect(meaning.bestCount(2)).toBe(2);
    expect(meaning.bestCount(3)).toBe(3);
    expect(meaning.bestCount(24)).toBe(3);
    expect(meaning.bestCount(47)).toBe(5);
    expect(meaning.bestCount(213)).toBe(10);
    expect(meaning.bestCount(5000)).toBe(10);
  });
});

describe("sheetOrder", () => {
  const p = profileSheet(csv(`x,y\n1,10\n1,12\n1,11\n2,20\n3,30\n2,21\n4,40\n4,39`));
  const y = p.columns[1].numbers;
  const groups = replicateGroups(p, new Set(), "y");

  it("names the best row, its recipe's repeats, and the first consecutive block with the count of other blocks", () => {
    expect(consecutiveBlocks(groups).map((g) => g.rows)).toEqual([[0, 1, 2], [6, 7]]);
    expect(meaning.sheetOrder(y, groups)).toBe("Best run: row 7 at 40; it is one of 2 runs of the same recipe. Rows 1 to 3 repeat one recipe 3 times, and 1 more block does the same.");
  });

  it("says when nothing repeats", () => {
    const q = profileSheet(csv(`x,y\n1,5\n2,9\n3,7`));
    expect(meaning.sheetOrder(q.columns[1].numbers, replicateGroups(q, new Set(), "y"))).toBe("Best run: row 2 at 9; no other run repeats its recipe. No block of consecutive rows repeats a recipe.");
  });

  it("does not bracket replicates that are not next to each other, and skips blank targets", () => {
    const q = profileSheet(csv(`x,y\n1,5\n2,\n1,6`));
    const g = replicateGroups(q, new Set(), "y");
    expect(consecutiveBlocks(g)).toEqual([]);
    expect(meaning.sheetOrder(q.columns[1].numbers, g)).toBe("Best run: row 3 at 6; it is one of 2 runs of the same recipe. No block of consecutive rows repeats a recipe.");
  });

  it("adds one sentence for the latest round, against the sheet's own best", () => {
    const origins = [null, null, null, null, null, null, "Round 1", "Round 1"];
    expect(meaning.sheetOrder(y, groups, origins)).toContain("Round 1 added 2 runs; its best, 40, beat the sheet's best 30.");
    expect(meaning.latestRound([10, 20, 5, 7], [null, null, "Round 1", "Round 2"])).toBe("Round 2 added 1 run; its best, 7, did not beat the sheet's best 20.");
    expect(meaning.latestRound([10, 20, null], [null, null, "Round 1"])).toBe("Round 1 added 1 run.");
    expect(meaning.latestRound([10, 20], [null, null])).toBeNull();
    expect(meaning.sheetOrder([null, null], [])).toBeNull();
  });
});

describe("categoryStrips", () => {
  it("names the highest and lowest median level with n and how many levels the best runs came from", () => {
    const points = [
      { x: "A", y: 1 },
      { x: "A", y: 3 },
      { x: "B", y: 10 },
      { x: "B", y: 12 },
      { x: "C", y: 5 },
    ];
    expect(meaning.levelsByMedian(points).map((l) => l.value)).toEqual(["B", "C", "A"]);
    expect(meaning.categoryStrips("src", "Titer", points)).toBe("B had the highest median Titer (11, n = 2) and A the lowest (2, n = 2); the best 3 runs came from 2 different src values.");
  });
  it("says when there is one level and nothing with no points", () => {
    expect(meaning.categoryStrips("src", "Titer", [{ x: "A", y: 1 }, { x: "A", y: 2 }])).toBe("src is A in every one of these 2 runs, so it cannot show an association with Titer.");
    expect(meaning.categoryStrips("src", "Titer", [])).toBeNull();
  });
});

describe("scatter", () => {
  const up = Array.from({ length: 20 }, (_, i) => ({ x: i + 1, y: (i + 1) * 2 }));
  it("states the direction by |rho| and where the best runs sat", () => {
    expect(meaning.scatter("SP", "Titer", up, 0.9)).toBe("Higher SP went with higher Titer; the best 3 runs all had SP above 18.");
    expect(meaning.scatter("SP", "Titer", up, -0.6)).toBe("Higher SP went with lower Titer; the best 3 runs all had SP above 18.");
    expect(meaning.scatter("SP", "Titer", up, 0.3)).toBe("Higher SP tended to go with higher Titer, loosely; the best 3 runs all had SP above 18.");
    expect(meaning.scatter("SP", "Titer", up, 0.1)).toBe("Titer showed no clear trend with SP; the best 3 runs all had SP above 18.");
    expect(meaning.scatter("SP", "Titer", up, null)).toContain("showed no clear trend");
  });
  it("gives the range when the best runs straddle the median, and 'below' when they all sit under it", () => {
    const down = up.map((p) => ({ x: p.x, y: -p.y }));
    expect(meaning.scatter("SP", "Titer", down, -0.9)).toBe("Higher SP went with lower Titer; the best 3 runs all had SP below 3.");
    const mixed = [
      { x: 1, y: 10 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 5, y: 9 },
      { x: 6, y: 1 },
      { x: 7, y: 1 },
      { x: 8, y: 1 },
      { x: 9, y: 8 },
    ];
    expect(meaning.scatter("SP", "Titer", mixed, 0)).toBe("Titer showed no clear trend with SP; the best 3 runs had SP from 1 to 9.");
  });
  it.skipIf(!existsSync(sample("pichia_HSA.csv")))("reads the pichia HSA sheet as higher SP going with higher Titer", () => {
    const p = profileSheet(csv(readFileSync(sample("pichia_HSA.csv"), "utf8")));
    const s = meaning.leadSentence(p, "Titer", ["CarbonSource", "Carbon_conc", "Gly", "Met", "SP"])!;
    expect(s).toMatch(/^Higher SP went with higher Titer; the best 10 runs all had SP above /);
    expect(s).not.toMatch(BANNED);
  });
});

describe("histogram sentence", () => {
  it("names the fullest bin with its share and how many bins above it the top value sits", () => {
    const h = histogram([0, 1, 1, 2, 3, 3, 3, 4, 5, 20], 4)!;
    const s = meaning.histogram(h, 10, 20)!;
    expect(s).toMatch(/^\d+ of 10 runs \(\d+%\) fall between \S+ and \S+, the fullest bin; the top value, 20, is \d+ bins? above it\.$/);
  });
  it("says 'in that bin' when the top value is in the fullest bin", () => {
    expect(meaning.histogram({ edges: [0, 5, 10], counts: [1, 4] }, 5, 9)).toBe("4 of 5 runs (80%) fall between 5 and 10, the fullest bin; the top value, 9, is in that bin.");
    expect(meaning.histogram({ edges: [0, 5, 10], counts: [4, 1] }, 5, 9)).toBe("4 of 5 runs (80%) fall between 0 and 5, the fullest bin; the top value, 9, is 1 bin above it.");
  });
});

describe("replicate sentence", () => {
  it("adds the within-recipe spread as a share of the spread across all runs", () => {
    const p = profileSheet(csv(`x,y\n1,10\n1,12\n2,20\n2,21\n3,30\n3,31\n4,40`));
    const groups = replicateGroups(p, new Set(), "y");
    const all = summarize(p.columns[1].numbers.filter((v): v is number => v != null))!.sd;
    const s = meaning.replicate(replicateSpread(groups), all);
    expect(s).toMatch(/^3 recipes run more than once \(6 runs\)\. Median spread within a recipe: \S+, which is \d+% of the spread across all runs\.$/);
    expect(meaning.replicate(replicateSpread(groups), null)).toMatch(/Median spread within a recipe: \S+\.$/);
    expect(meaning.replicate({ groups: 0, runs: 0, medianSd: null }, all)).toBe("No replicates: no two runs share every input value, so run-to-run spread cannot be measured from this sheet.");
  });
});

describe("other sentences", () => {
  it("explains a nearly constant input", () => {
    expect(meaning.nearlyConstant("pH", "IVCD", 6.978, 7.028)).toBe("pH is nearly constant (6.978 to 7.028), so this sheet cannot show its association with IVCD.");
  });
  it("says which rows a data_type column keeps out of the charts", () => {
    const p = profileSheet(csv(`x,data_type,y\n1,real,2\n2,synthetic,3\n3,Simulated,4\n4,real,5`));
    expect(meaning.leftOut(measuredOnly(p)!, p.n)).toBe("2 of 4 rows are marked Simulated (1), synthetic (1) in data_type, so they stay in the table and out of every chart; only the 2 runs marked measured are drawn.");
  });
  it("counts the best measured runs among the top predictions, and the predictions within the band", () => {
    const oof: [number, number][] = [
      [10, 11],
      [20, 18],
      [30, 25],
      [5, 9],
      [15, 8],
    ];
    expect(meaning.predictedVsMeasured(oof)).toBe("The model's top 3 predicted runs include 2 of the 3 best measured runs.");
    expect(meaning.predictedVsMeasured(oof, 4)).toBe("The model's top 3 predicted runs include 2 of the 3 best measured runs; 3 of 5 predictions landed within 4 of the measurement.");
    expect(meaning.predictedVsMeasured([])).toBeNull();
  });
  it("gives no lead sentence without a numeric target or a rankable input", () => {
    const p = profileSheet(csv(`x,y\n1,a\n2,b`));
    expect(meaning.leadSentence(p, "y", ["x"])).toBeNull();
    const q = profileSheet(csv(`x,y\n1,1\n2,2\n3,3`));
    expect(meaning.leadSentence(q, "y", ["x"])).toBeNull();
  });
  it("never claims a cause", () => {
    const p = profileSheet(csv(`x,c,y\n1,A,10\n1,A,12\n2,B,20\n2,B,30\n3,C,50\n3,C,40`));
    const sentences = [
      meaning.sheetOrder(p.columns[2].numbers, replicateGroups(p, new Set(), "y")),
      meaning.leadSentence(p, "y", ["x", "c"]),
      meaning.inputSentence(p.columns[1], p.columns[2]),
      meaning.histogram(histogram([10, 12, 20, 30, 50, 40])!, 6, 50),
      meaning.nearlyConstant("x", "y", 1, 1.001),
    ];
    for (const s of sentences) {
      expect(s).toBeTruthy();
      expect(s).not.toMatch(BANNED);
    }
  });
});
