// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PopulatedResult, StagesView } from "@/lib/api";
import { decisionWords, scaleTrackSummary } from "@/lib/overview";
import type { ActiveCampaign } from "@/lib/workbench";
import stagesFixture from "./fixtures/report-v2-stages.json";
import v2Analysis from "./fixtures/report-v2-analysis.json";
import v2Detail from "./fixtures/report-v2-detail.json";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { EvidenceRow } from "@/components/overview/evidence-row";
import { ScaleTrackLine, scaleUpHref } from "@/components/overview/scale-track";

const stages = stagesFixture as unknown as StagesView;
const ID = "cmp_a28912911eee460dae2524ecd4047e7b";

/** The engine's default stages with S2 (go, older) and S3 (no-go, newer) decided and S3 recorded as current. */
function decided(): StagesView {
  const s = structuredClone(stages);
  const rec = (gate: string, decision: "go" | "no_go", at: number) => ({ id: at, gate, decision, note: "n", evidence_linked: [], decided_by: "bob@acme", decided_at: at, basis: "recorded" as const });
  s.current_stage = "S3";
  s.stages[1].gate = { ...s.stages[1].gate, decision: "go", state: "recorded", current: rec("S2", "go", 1795000000), history_count: 1 };
  s.stages[2].gate = { ...s.stages[2].gate, decision: "no_go", state: "recorded", current: rec("S3", "no_go", 1795100000), history_count: 2 };
  return s;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("scale track summary (GET /stages, recorded only)", () => {
  it("reports nothing recorded on the engine's default stages, never a guessed stage", () => {
    expect(scaleTrackSummary(stages)).toEqual({ current: null, latest: null, recorded: 0, total: 6 });
  });

  it("names the recorded current stage and the newest decision across gates", () => {
    const s = scaleTrackSummary(decided());
    expect(s.current).toEqual({ key: "S3", label: "Flask" });
    expect(s.latest).toMatchObject({ gate: "S3", decision: "no_go", stageLabel: "Flask", decided_by: "bob@acme" });
    expect(s.recorded).toBe(2);
  });

  it("decision words", () => {
    expect([decisionWords("go"), decisionWords("no_go"), decisionWords("pending"), decisionWords(null)]).toEqual(["Go", "No-go", "Pending", "Not recorded"]);
  });
});

describe("Overview scale-up line", () => {
  const stub = (body: unknown, status = 200) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
    );

  it("shows the current stage and latest decision with a link to the scale-up page", async () => {
    stub(decided());
    render(<ScaleTrackLine campaignId={ID} />);
    expect(await screen.findByText("No-go")).toBeTruthy();
    const line = screen.getByRole("region", { name: "Scale-up track" });
    expect(line.textContent).toMatch(/Current stage: Flask S3 \(recorded by a person, never computed\)/);
    expect(line.textContent).toMatch(/at Flask, by bob@acme/);
    expect(line.textContent).toMatch(/2 of 6 gates have a decision/);
    expect(screen.getByRole("link", { name: /Open scale-up/ }).getAttribute("href")).toBe(`/campaigns/${ID}/scale-up`);
    expect(scaleUpHref("a b")).toBe("/campaigns/a%20b/scale-up");
  });

  it("says none recorded on default stages", async () => {
    stub(stages);
    render(<ScaleTrackLine campaignId={ID} />);
    expect(await screen.findByText("none recorded")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Scale-up track" }).textContent).toMatch(/none recorded yet/);
  });

  it("a failed read is a connection problem, not 'no decision'", async () => {
    stub({ error: "boom" }, 502);
    render(<ScaleTrackLine campaignId={ID} />);
    expect(await screen.findByText(/Could not load the scale-up stages/)).toBeTruthy();
    expect(screen.queryByText(/none recorded/)).toBeNull();
  });
});

describe("Overview evidence row (engine v2 analysis)", () => {
  it("uses the engine's target unit and shows top-k caught in the reliability evidence", () => {
    render(
      <EvidenceRow
        campaign={v2Detail.summary as unknown as ActiveCampaign}
        analysis={v2Analysis as unknown as PopulatedResult}
        analysisFailed={false}
        predictHref="/p"
      />,
    );
    const row = screen.getByRole("region", { name: "Evidence" });
    expect(row.textContent).toContain("g/L");
    expect(row.textContent).toMatch(/Top-k caught: 2 of the true top 5 caught \(n=160\)\./);
  });

  it("a user-set unit wins over the header", () => {
    const a = { ...(v2Analysis as object), target_unit: { unit: "mg/mL", source: "user", header: "titer_g_L", note: "set by the user" } } as unknown as PopulatedResult;
    render(<EvidenceRow campaign={v2Detail.summary as unknown as ActiveCampaign} analysis={a} analysisFailed={false} predictHref="/p" />);
    expect(screen.getByRole("region", { name: "Evidence" }).textContent).toContain("mg/mL");
  });
});
