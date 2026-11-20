import { describe, expect, it } from "vitest";
import { CAMPAIGN_PAGE_LABEL, CAMPAIGN_STAGES, CYCLE_STEPS, campaignHref, cycleKeyFor, parseCampaignPath, sectionFor, stageHref } from "@/lib/routes";

const ID = "cmp_0123456789abcdef0123456789abcdef";

describe("cycle steps (Harmonize -> Predict -> Validate)", () => {
  it("are numbered 1-3 in order", () => {
    expect(CYCLE_STEPS.map((s) => [s.n, s.key])).toEqual([
      [1, "harmonize"],
      [2, "predict"],
      [3, "validate"],
    ]);
  });

  it("cover every engine stage exactly once", () => {
    const covered = CYCLE_STEPS.flatMap((s) => s.stages);
    expect([...covered].sort()).toEqual(CAMPAIGN_STAGES.map((s) => s.key).sort());
    expect(new Set(covered).size).toBe(covered.length);
  });

  it("maps each engine stage to its step", () => {
    expect(cycleKeyFor("setup")).toBe("harmonize");
    expect(cycleKeyFor("plan")).toBe("predict");
    expect(cycleKeyFor("run")).toBe("validate");
    expect(cycleKeyFor("record")).toBe("validate");
    expect(cycleKeyFor("learn")).toBe("validate");
  });
});

describe("campaignHref / stageHref", () => {
  it("builds campaign-scoped paths", () => {
    expect(campaignHref(ID)).toBe(`/campaigns/${ID}`);
    expect(campaignHref(ID, "predict")).toBe(`/campaigns/${ID}/predict`);
    expect(campaignHref(ID, "report")).toBe(`/campaigns/${ID}/report`);
    expect(campaignHref(ID, "scale-up")).toBe(`/campaigns/${ID}/scale-up`);
  });

  it("encodes the id", () => {
    expect(campaignHref("a/b")).toBe("/campaigns/a%2Fb");
  });

  it("sends each engine stage's action to its section", () => {
    expect(stageHref(ID, "setup")).toBe(`/campaigns/${ID}/harmonize`);
    expect(stageHref(ID, "plan")).toBe(`/campaigns/${ID}/predict`);
    expect(stageHref(ID, "run")).toBe(`/campaigns/${ID}/validate`);
    expect(stageHref(ID, "record")).toBe(`/campaigns/${ID}/validate#record`);
    expect(stageHref(ID, "learn")).toBe(`/campaigns/${ID}/validate#learn`);
  });
});

describe("parseCampaignPath", () => {
  it("reads the id and sub-page", () => {
    expect(parseCampaignPath(`/campaigns/${ID}`)).toEqual({ id: ID, page: "" });
    expect(parseCampaignPath(`/campaigns/${ID}/`)).toEqual({ id: ID, page: "" });
    expect(parseCampaignPath(`/campaigns/${ID}/harmonize`)).toEqual({ id: ID, page: "harmonize" });
    expect(parseCampaignPath(`/campaigns/${ID}/report`)).toEqual({ id: ID, page: "report" });
    expect(parseCampaignPath(`/campaigns/${ID}/scale-up`)).toEqual({ id: ID, page: "scale-up" });
  });

  it("labels the campaign's scale-up track", () => {
    expect(CAMPAIGN_PAGE_LABEL["scale-up"]).toBe("Scale-up track");
  });

  it("round-trips campaignHref", () => {
    expect(parseCampaignPath(campaignHref("a b", "validate"))).toEqual({ id: "a b", page: "validate" });
  });

  it("is null outside a campaign or for an unknown sub-page", () => {
    expect(parseCampaignPath("/")).toBeNull();
    expect(parseCampaignPath("/campaigns")).toBeNull();
    expect(parseCampaignPath("/scale-up")).toBeNull();
    expect(parseCampaignPath(`/campaigns/${ID}/plan`)).toBeNull();
    expect(parseCampaignPath(`/campaigns/${ID}/predict/extra`)).toBeNull();
    expect(parseCampaignPath("/campaigns/%E0%A4%A")).toBeNull();
  });
});

describe("sectionFor", () => {
  it("highlights the right sidebar section", () => {
    expect(sectionFor("/")).toBe("campaigns");
    expect(sectionFor(`/campaigns/${ID}/predict`)).toBe("campaigns");
    expect(sectionFor("/scale-up")).toBe("scale-up");
    // A campaign's own scale-up track sits under Campaigns, not the global Scale-up entry.
    expect(sectionFor(`/campaigns/${ID}/scale-up`)).toBe("campaigns");
    expect(sectionFor("/settings/security")).toBe("settings");
  });
});
