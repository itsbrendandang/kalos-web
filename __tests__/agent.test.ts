import { describe, expect, it } from "vitest";
import { agentStatus, forecastCheck } from "@/lib/agent";
import type { CampaignRun } from "@/lib/api";
import type { ActiveCampaign } from "@/lib/workbench";

const run = (o: Partial<CampaignRun>): CampaignRun => ({ id: "a", recipe: {}, pred: 5, std: 0.3, mode: "exploit", reason: "", result: null, awaiting: true, ...o });
const campaign = (o: Partial<ActiveCampaign>) => ({ has_campaign: true, target: "t", features: [], n_base: 1, best: 1, round: 2, history: [], pending: [], n_awaiting: 0, n_measured: 0, ...o }) as ActiveCampaign;

describe("agentStatus", () => {
  it("says idle with no campaign", () => expect(agentStatus(null).state).toBe("idle"));
  it("waits on lab results and pluralises", () => {
    expect(agentStatus(campaign({ n_awaiting: 1 })).headline).toBe("Waiting on 1 lab result");
    expect(agentStatus(campaign({ n_awaiting: 3 })).headline).toBe("Waiting on 3 lab results");
  });
  it("is idle with nothing in flight", () => expect(agentStatus(campaign({})).headline).toBe("Nothing running"));
});

describe("forecastCheck", () => {
  it("is null when nothing is measured", () => expect(forecastCheck([run({})])).toBeNull());
  it("averages error and counts hits inside one sd", () => {
    const t = forecastCheck([run({ pred: 5, std: 0.3, result: 5.2, awaiting: false }), run({ pred: 5, std: 0.3, result: 4.0, awaiting: false })])!;
    expect(t.n).toBe(2);
    expect(t.meanAbsError).toBeCloseTo(0.6);
    expect(t.withinOneSd).toBe(1);
  });
});
