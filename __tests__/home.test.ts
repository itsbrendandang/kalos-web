import { describe, expect, it } from "vitest";
import type { CampaignDetail, CampaignMeta } from "@/lib/api";
import { EngineError } from "@/lib/engine-error";
import { campaignRowSummary, nameErrorMessage, NAME_MAX, sortCampaigns, validateCampaignName } from "@/lib/home";

const meta = (over: Partial<CampaignMeta> = {}): CampaignMeta => ({
  id: "cmp_1",
  name: "Line 4",
  created_by: null,
  created_at: 1,
  updated_at: 1,
  archived_at: null,
  archived: false,
  seeded: true,
  is_default: false,
  ...over,
});

describe("validateCampaignName", () => {
  it("trims and accepts 1 to 120 characters", () => {
    expect(validateCampaignName("  CHO titer  ")).toEqual({ ok: true, name: "CHO titer" });
    expect(validateCampaignName("a".repeat(NAME_MAX)).ok).toBe(true);
  });

  it("refuses empty, too long, and control characters with a sentence", () => {
    expect(validateCampaignName("   ")).toEqual({ ok: false, message: "Give the campaign a name." });
    const long = validateCampaignName("a".repeat(NAME_MAX + 1));
    expect(long.ok).toBe(false);
    expect(!long.ok && long.message).toContain("121");
    expect(validateCampaignName("a\tb").ok).toBe(false);
    expect(validateCampaignName("a\u0007b").ok).toBe(false);
    expect(validateCampaignName("a\u0085b").ok).toBe(false);
  });

  it("counts characters, not UTF-16 units", () => {
    expect(validateCampaignName("🧪".repeat(NAME_MAX)).ok).toBe(true);
  });
});

describe("nameErrorMessage", () => {
  it("turns the engine's 400 rule into a sentence, never the raw envelope", () => {
    const err = new EngineError(400, "invalid_body", undefined, "invalid request body: name: Value error, name must be 1-120 characters");
    expect(nameErrorMessage(err)).toBe("The engine refused this name: it must be 1-120 characters.");
    const ctl = new EngineError(400, "invalid_body", undefined, "invalid request body: name: Value error, name must not contain control characters");
    expect(nameErrorMessage(ctl)).toBe("The engine refused this name: it must not contain control characters.");
  });

  it("says a 403 is a permission, and a dropped connection is a connection problem", () => {
    expect(nameErrorMessage(new EngineError(403, "forbidden"))).toMatch(/role/);
    expect(nameErrorMessage(new EngineError(0, "engine_unreachable"))).toMatch(/did not respond/);
    expect(nameErrorMessage(new Error("boom"))).toMatch(/did not respond/);
  });
});

describe("sortCampaigns", () => {
  it("puts the most recently updated first without mutating the input", () => {
    const list = [meta({ id: "a", updated_at: 1 }), meta({ id: "b", updated_at: 3 }), meta({ id: "c", updated_at: 2 })];
    expect(sortCampaigns(list).map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(list.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("campaignRowSummary", () => {
  it("uses the engine's stage and next action, and the measured best", () => {
    const detail: CampaignDetail = {
      campaign: meta(),
      summary: {
        has_campaign: true,
        target: "titer_g_L",
        features: ["pH"],
        n_base: 160,
        best: 1.422,
        round: 0,
        history: [{ round: 0, best: 1.422, n_base: 160 }],
        pending: [],
        n_awaiting: 5,
        n_measured: 0,
        stage: {
          round: 1,
          current: "run",
          started: 5,
          steps: (["setup", "plan", "run", "record", "learn"] as const).map((key) => ({ key, state: "upcoming" as const, detail: "" })),
        },
        next_action: { stage: "record", action: "Record 5 results", reason: "5 runs are waiting." },
      },
    };
    const row = campaignRowSummary(detail);
    expect(row).toMatchObject({ hasData: true, round: 1, target: "titer_g_L", best: 1.422, runs: 160, awaiting: 5 });
    expect(row.next.action).toBe("Record 5 results");
    expect(row.next.href).toBe("/campaigns/cmp_1/validate#record");
  });

  it("an empty campaign has no numbers (null, never 0) and points to Harmonize", () => {
    const row = campaignRowSummary({ campaign: meta({ seeded: false }), summary: { has_campaign: false } });
    expect(row).toMatchObject({ hasData: false, round: null, target: null, best: null, runs: null, awaiting: null });
    expect(row.next.href).toBe("/campaigns/cmp_1/harmonize");
  });
});
