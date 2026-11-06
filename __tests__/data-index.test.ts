import { describe, expect, it } from "vitest";
import {
  analysisFacts,
  buildIndex,
  campaignFacts,
  campaignRounds,
  formatDate,
  indexVerdict,
  roundsCaption,
  type AnalysisFacts,
  type CampaignFacts,
  type CampaignInput,
} from "@/lib/data-index";
import type { SheetSummary } from "@/lib/sheet-store";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const sheet = (sha256: string, name: string, lastUsedAt: number, engine: SheetSummary["engine"] = null): SheetSummary => ({
  sha256,
  name,
  size: 100,
  type: "text/csv",
  addedAt: lastUsedAt,
  lastUsedAt,
  worksheet: null,
  engine,
});

const analysis = (sha: string | null, over: Partial<AnalysisFacts> = {}): AnalysisFacts => ({
  dataset: "pichia_HSA.csv",
  n: 213,
  d: 4,
  target: "Titer",
  features: ["SP", "Met", "Gly", "CarbonSource"],
  updated: 1_700_000_000,
  run: sha ? { input_sha256: sha, filename: "pichia_HSA.csv" } : undefined,
  ...over,
});

const run = (round: number | null, result: number | null) => ({ round: round ?? undefined, result, awaiting: result == null });

const summary = (over: Partial<CampaignFacts> = {}): CampaignFacts => ({
  target: "Titer",
  n_base: 213,
  best: 63.29,
  round: 0,
  history: [{ round: 0, best: 63.29, n_base: 213 }],
  pending: [],
  ...over,
});

const campaign = (over: Partial<CampaignInput> = {}): CampaignInput => ({
  id: "cmp_1",
  name: "Default campaign",
  is_default: true,
  analysis: analysis(SHA_A),
  summary: summary(),
  ...over,
});

describe("buildIndex: sheets", () => {
  it("lists stored sheets newest first and marks the one the campaign's analysis was made from", () => {
    const idx = buildIndex({
      sheets: [sheet(SHA_B, "candida.csv", 1000, { target: "Yield", features: ["a", "b"], n: 13, d: 2, dataset: "candida.csv" }), sheet(SHA_A, "pichia_HSA.csv", 2000)],
      campaigns: [campaign()],
    });
    expect(idx.sheets.map((s) => s.name)).toEqual(["pichia_HSA.csv", "candida.csv"]);
    expect(idx.sheets[0]).toMatchObject({ sha: SHA_A, rows: 213, inputs: 4, target: "Titer", usedBy: { campaignId: "cmp_1", campaignName: "Default campaign" }, rounds: [] });
    // A sheet the engine is not using keeps what the engine said when it was uploaded.
    expect(idx.sheets[1]).toMatchObject({ sha: SHA_B, rows: 13, inputs: 2, target: "Yield", usedBy: null });
    expect(idx.engineOnly).toEqual([]);
  });

  it("reads null facts for a sheet stored without engine facts and not in use", () => {
    const idx = buildIndex({ sheets: [sheet(SHA_B, "x.csv", 1)], campaigns: [campaign()] });
    expect(idx.sheets[0]).toMatchObject({ rows: null, inputs: null, target: null, usedBy: null });
  });

  it("lists an analysis whose sha matches no stored sheet as engine-only, with its date in ms", () => {
    const idx = buildIndex({ sheets: [sheet(SHA_B, "x.csv", 1)], campaigns: [campaign()] });
    expect(idx.engineOnly).toEqual([
      { campaignId: "cmp_1", campaignName: "Default campaign", dataset: "pichia_HSA.csv", rows: 213, inputs: 4, target: "Titer", updatedAt: 1_700_000_000_000 },
    ]);
  });

  it("treats an analysis without a sha as engine-only (an older engine), never as a match", () => {
    const idx = buildIndex({ sheets: [sheet(SHA_A, "pichia_HSA.csv", 1)], campaigns: [campaign({ analysis: analysis(null) })] });
    expect(idx.sheets[0].usedBy).toBeNull();
    expect(idx.engineOnly).toHaveLength(1);
  });

  it("gives a sheet the rounds recorded from it, in order", () => {
    const c = campaign({
      summary: summary({
        round: 2,
        history: [
          { round: 0, best: 60, n_base: 213 },
          { round: 1, best: 62, n_base: 216 },
          { round: 2, best: 65, n_base: 220 },
        ],
        pending: [run(2, null), run(2, 61)],
      }),
    });
    const idx = buildIndex({ sheets: [sheet(SHA_A, "pichia_HSA.csv", 1)], campaigns: [c] });
    expect(idx.sheets[0].rounds).toEqual([1, 2, 3]);
  });
});

describe("campaignRounds", () => {
  it("counts a folded round's measured runs from the growth of n_base and keeps its best", () => {
    const rows = campaignRounds(
      campaign({
        summary: summary({
          round: 2,
          history: [
            { round: 0, best: 60, n_base: 213 },
            { round: 1, best: 62, n_base: 216 },
            { round: 2, best: 65, n_base: 220 },
          ],
        }),
      }),
      "pichia_HSA.csv",
    );
    expect(rows).toEqual([
      { campaignId: "cmp_1", campaignName: "Default campaign", round: 2, measured: 4, awaiting: 0, best: 65, folded: true, fromSheet: "pichia_HSA.csv" },
      { campaignId: "cmp_1", campaignName: "Default campaign", round: 1, measured: 3, awaiting: 0, best: 62, folded: true, fromSheet: "pichia_HSA.csv" },
    ]);
  });

  it("places runs started in engine round k in the 1-based round k + 1, counting measured and awaiting", () => {
    const rows = campaignRounds(campaign({ summary: summary({ pending: [run(0, 61.5), run(0, 58), run(0, null)] }) }), "pichia_HSA.csv");
    expect(rows).toEqual([{ campaignId: "cmp_1", campaignName: "Default campaign", round: 1, measured: 2, awaiting: 1, best: 61.5, folded: false, fromSheet: "pichia_HSA.csv" }]);
  });

  it("keeps a run still awaiting after its round folded on that round", () => {
    const rows = campaignRounds(
      campaign({
        summary: summary({
          round: 1,
          history: [
            { round: 0, best: 60, n_base: 213 },
            { round: 1, best: 62, n_base: 215 },
          ],
          pending: [run(0, null), run(1, null)],
        }),
      }),
      "s.csv",
    );
    expect(rows.map((r) => [r.round, r.measured, r.awaiting, r.folded])).toEqual([
      [2, 0, 1, false],
      [1, 2, 1, true],
    ]);
  });

  it("leaves out runs the engine never stamped with a round, and the seeded round 0", () => {
    expect(campaignRounds(campaign({ summary: summary({ pending: [run(null, 50)] }) }), "s.csv")).toEqual([]);
  });

  it("returns nothing without a summary", () => {
    expect(campaignRounds(campaign({ summary: null }), "s.csv")).toEqual([]);
  });

  it("names the round's sheet by the stored name when held, else the engine's dataset name", () => {
    const c = campaign({ summary: summary({ pending: [run(0, 1)] }), analysis: analysis(SHA_A, { dataset: "pichia_HSA.csv" }) });
    expect(buildIndex({ sheets: [sheet(SHA_A, "my copy.csv", 1)], campaigns: [c] }).rounds[0].fromSheet).toBe("my copy.csv");
    expect(buildIndex({ sheets: [], campaigns: [c] }).rounds[0].fromSheet).toBe("pichia_HSA.csv");
  });
});

describe("facts from engine responses", () => {
  it("reads the analysis facts off /api/latest and nothing when there is no data", () => {
    expect(analysisFacts({ has_data: false })).toBeNull();
    expect(analysisFacts(null)).toBeNull();
    const latest = { has_data: true as const, dataset: "x.csv", n: 3, d: 1, target: "y", features: ["a"], updated: 5, run: { input_sha256: SHA_A, filename: "x.csv", seed: 1 } };
    expect(analysisFacts(latest as never)).toEqual({ dataset: "x.csv", n: 3, d: 1, target: "y", features: ["a"], updated: 5, run: { input_sha256: SHA_A, filename: "x.csv" } });
  });

  it("reads the campaign facts off /api/campaign and nothing before a campaign exists", () => {
    expect(campaignFacts({ has_campaign: false })).toBeNull();
    const c = { has_campaign: true as const, target: "y", features: ["a"], n_base: 3, best: 1, round: 0, history: [], pending: [], n_awaiting: 0, n_measured: 0 };
    expect(campaignFacts(c)).toEqual({ target: "y", n_base: 3, best: 1, round: 0, history: [], pending: [] });
  });
});

describe("indexVerdict", () => {
  const empty = { sheets: [], rounds: [], engineOnly: [] };
  const held = (k: number) => ({ ...empty, sheets: Array.from({ length: k }, (_, i) => ({ sha: String(i), name: "", rows: null, inputs: null, target: null, loadedAt: 0, usedBy: null, rounds: [] })) });

  it("says nothing is loaded when the browser holds nothing and the engine has nothing", () => {
    expect(indexVerdict(empty, null)).toBe("Nothing loaded yet.");
  });

  it("names the sheet the campaign is working from, with its row count", () => {
    expect(indexVerdict(held(2), analysis(SHA_A))).toBe("2 sheets held here; the campaign is working from pichia_HSA.csv (213 rows).");
    expect(indexVerdict(held(1), analysis(null, { n: 1 }))).toBe("1 sheet held here; the campaign is working from pichia_HSA.csv (1 row).");
  });

  it("does not claim the engine's state when it could not be asked", () => {
    expect(indexVerdict(held(1), null, false)).toBe("1 sheet held here; the engine could not be asked which one the campaign is working from.");
    expect(indexVerdict(empty, null, false)).toBe("No sheet is held in this browser; the engine could not be asked which one the campaign is working from.");
  });

  it("says when sheets are held but the campaign has no run sheet", () => {
    expect(indexVerdict(held(1), null)).toBe("1 sheet held here; the campaign has no run sheet yet.");
  });
});

describe("captions", () => {
  it("lists rounds in plain words", () => {
    expect(roundsCaption([])).toBeNull();
    expect(roundsCaption([1])).toBe("Round 1 recorded from it");
    expect(roundsCaption([1, 2])).toBe("Rounds 1 and 2 recorded from it");
    expect(roundsCaption([1, 2, 3])).toBe("Rounds 1, 2 and 3 recorded from it");
  });

  it("formats a date and never a fake one", () => {
    expect(formatDate(Date.UTC(2026, 0, 15, 12))).toMatch(/Jan 1[56], 2026/);
    expect(formatDate(Number.NaN)).toBe("n/a");
  });
});
