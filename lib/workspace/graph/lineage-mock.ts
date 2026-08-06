// Demo-mode seed for the Map tab's Lineage lens, gated behind
// NEXT_PUBLIC_DEMO_MODE (lib/demo.ts) and always accompanied by the visible
// DemoBadge - see components/workspace/map/map-view.tsx.
//
// This module deliberately produces an ENGINE-SHAPED payload (the exact
// `GET /api/campaign` response type), not a pre-built LineageGraph. Demo and
// real data therefore run through the identical builder in ./build-lineage.ts,
// so a demo run exercises the same attribution, the same descent-edge rules,
// and the same traceable-vs-total arithmetic the engine's own data will.
// A hand-authored graph would let demo mode show a lineage shape the real
// pipeline could never produce, which is exactly the failure mode the
// honesty rule exists to prevent.
//
// The campaign it describes is the design handoff's own illustrative one
// (CHO titer uplift), scaled to a realistic kalos campaign: 96 rows uploaded
// from a CSV that carries no per-row ids (hence untraceable forever), then
// four rounds of runs that DO keep their ids through the fold.
import type { Campaign, CampaignRun } from "@/lib/api";

type ActiveCampaign = Extract<Campaign, { has_campaign: true }>;

const DAY = 86_400;
const ts = (iso: string) => Date.parse(`${iso}T16:00:00Z`) / 1000;

/** Round close dates, deliberately uneven: the gap between round 2 and
 *  round 3 is the long assay wait the design's activity strip calls out, and
 *  the replay footer renders that gap at its real width. */
const ROUND_CLOSE = ["2026-04-28", "2026-05-12", "2026-06-03", "2026-07-21"] as const;
const FOLDED_PER_ROUND = [12, 12, 12, 10] as const;

function foldedRows(): { run_id: string; created_at: number; measured_at: number }[] {
  const rows: { run_id: string; created_at: number; measured_at: number }[] = [];
  ROUND_CLOSE.forEach((close, round) => {
    const closeTs = ts(close);
    const n = FOLDED_PER_ROUND[round];
    for (let i = 0; i < n; i++) {
      // Spread each round's readouts back from its close date so the runs
      // inside a round carry distinct, ordered timestamps.
      const measured = closeTs - (n - 1 - i) * DAY * 0.5;
      rows.push({ run_id: `r${round}-${String(i + 1).padStart(2, "0")}`, created_at: measured - 9 * DAY, measured_at: measured });
    }
  });
  return rows;
}

const FOLDED = foldedRows();
const TRACEABLE_IDS = FOLDED.map((r) => r.run_id);

/** 96 uploaded rows + every folded run = the true base-row count the GP
 *  conditions on. `parent_row_count` on every pending run below is this
 *  number; `parent_ids` is only the folded subset. The gap (96) is real. */
const UPLOADED_ROWS = 96;
const N_BASE = UPLOADED_ROWS + FOLDED.length;

const OPEN_ROUND_START = ts("2026-07-23");

type MockRun = Omit<CampaignRun, "created_at" | "measured_at" | "parent_ids" | "parent_row_count">;
type MockProposal = Omit<MockRun, "result" | "awaiting">;

function pending(): CampaignRun[] {
  const measuredBase: MockRun[] = [
    { id: "p-m1", recipe: { glucose_gL: 6.8, feed_rate_mLh: 0.55, pH_setpoint: 7.05 }, pred: 6.5, std: 0.31, mode: "exploit", reason: "Glucose held, feed nudged up", result: 6.42, awaiting: false },
    { id: "p-m2", recipe: { glucose_gL: 7.4, feed_rate_mLh: 0.62, pH_setpoint: 7.0 }, pred: 6.9, std: 0.36, mode: "exploit", reason: "Glucose up, feed earlier", result: 7.11, awaiting: false },
    { id: "p-m3", recipe: { glucose_gL: 5.2, feed_rate_mLh: 0.48, pH_setpoint: 7.15 }, pred: 6.0, std: 0.74, mode: "explore", reason: "Untested corner, buys information", result: 6.38, awaiting: false },
  ];
  const measured: CampaignRun[] = measuredBase.map((r, i) => ({
    ...r,
    created_at: OPEN_ROUND_START + i * DAY * 0.2,
    measured_at: OPEN_ROUND_START + 11 * DAY + i * DAY * 0.4,
    parent_ids: TRACEABLE_IDS,
    parent_row_count: N_BASE,
  }));

  const proposalBase: MockProposal[] = [
    { id: "p-a1", recipe: { glucose_gL: 7.6, feed_rate_mLh: 0.64, pH_setpoint: 7.0 }, pred: 7.3, std: 0.29, mode: "exploit", reason: "Push the round-3 winner further" },
    { id: "p-a2", recipe: { glucose_gL: 7.2, feed_rate_mLh: 0.58, pH_setpoint: 6.95 }, pred: 7.1, std: 0.33, mode: "exploit", reason: "Feed earlier, glucose held" },
    { id: "p-a3", recipe: { glucose_gL: 6.9, feed_rate_mLh: 0.7, pH_setpoint: 7.05 }, pred: 6.9, std: 0.38, mode: "exploit", reason: "Feed rate alone" },
    { id: "p-a4", recipe: { glucose_gL: 4.8, feed_rate_mLh: 0.42, pH_setpoint: 7.2 }, pred: 6.2, std: 0.91, mode: "explore", reason: "Low-glucose corner never sampled" },
    { id: "p-a5", recipe: { glucose_gL: 8.1, feed_rate_mLh: 0.51, pH_setpoint: 6.9 }, pred: 6.6, std: 0.84, mode: "explore", reason: "High glucose, low feed" },
    { id: "p-a6", recipe: { glucose_gL: 6.1, feed_rate_mLh: 0.75, pH_setpoint: 7.25 }, pred: 6.4, std: 0.79, mode: "explore", reason: "pH ceiling, buys information" },
  ];
  const proposals: CampaignRun[] = proposalBase.map((r, i) => ({
    ...r,
    result: null,
    awaiting: true,
    created_at: OPEN_ROUND_START + 12 * DAY + i * DAY * 0.05,
    measured_at: null,
    parent_ids: TRACEABLE_IDS,
    parent_row_count: N_BASE,
  }));

  return [...measured, ...proposals];
}

export const MOCK_LINEAGE_CAMPAIGN: ActiveCampaign = {
  has_campaign: true,
  target: "titer_g_per_L",
  features: ["glucose_gL", "feed_rate_mLh", "pH_setpoint"],
  n_base: N_BASE,
  best: 6.4,
  round: 4,
  history: [
    { round: 0, best: 3.24, n_base: UPLOADED_ROWS },
    { round: 1, best: 4.1, n_base: UPLOADED_ROWS + 12 },
    { round: 2, best: 5.72, n_base: UPLOADED_ROWS + 24 },
    { round: 3, best: 6.4, n_base: UPLOADED_ROWS + 36 },
    { round: 4, best: 6.4, n_base: N_BASE },
  ],
  pending: pending(),
  n_awaiting: 6,
  n_measured: 3,
  lineage: { folded_rows: FOLDED },
};

/** The conformal band the demo's "within noise" neighbour edges use - the
 *  same quantity `GET /api/latest` reports as `conformal_q` in real mode. */
export const MOCK_NOISE_BAND = 0.12;
