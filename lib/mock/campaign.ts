// Demo data for the Experiments hub's Live workbench (components/workbench/).
// Only rendered when NEXT_PUBLIC_DEMO_MODE is on AND the engine confirmed
// there is no real campaign (see `campaignView` in lib/workbench.ts), always
// behind an "Example data" badge. Deterministic and static - no
// `Math.random()` or `Date.now()` - so server and client renders match.
// Shaped exactly like GET /api/campaign and GET /api/latest proposals, so the
// workbench renders it through the same code path as real data.

import type { CampaignRun } from "@/lib/api";
import type { ActiveCampaign } from "@/lib/workbench";

const run = (
  id: string,
  recipe: Record<string, number>,
  pred: number,
  std: number,
  mode: CampaignRun["mode"],
  reason: string,
  result: number | null,
): CampaignRun => ({ id, recipe, pred, std, mode, reason, result, awaiting: result == null });

export const DEMO_CAMPAIGN: ActiveCampaign = {
  has_campaign: true,
  target: "titer_g_per_L",
  features: ["pH", "Temp_C", "Feed_pct"],
  n_base: 31,
  best: 5.42,
  round: 3,
  history: [
    { round: 0, best: 4.61, n_base: 24 },
    { round: 1, best: 4.98, n_base: 26 },
    { round: 2, best: 5.2, n_base: 29 },
    { round: 3, best: 5.42, n_base: 31 },
  ],
  pending: [
    run("d3f1a9c2e7", { pH: 7.05, Temp_C: 36.4, Feed_pct: 3.2 }, 5.61, 0.28, "exploit", "highest predicted titer", null),
    run("a81c44be09", { pH: 6.82, Temp_C: 37.1, Feed_pct: 2.6 }, 5.18, 0.51, "explore", "diversifies the batch", null),
    run("5be2d07f13", { pH: 7.21, Temp_C: 35.8, Feed_pct: 3.6 }, 5.47, 0.35, "exploit", "near the best measured run", null),
    run("e40b9a6612", { pH: 6.95, Temp_C: 36.9, Feed_pct: 3.0 }, 5.33, 0.3, "exploit", "highest predicted titer", 5.51),
    run("7c09f2d85a", { pH: 6.64, Temp_C: 37.4, Feed_pct: 2.2 }, 4.72, 0.62, "explore", "least-sampled region", 4.38),
  ],
  n_awaiting: 3,
  n_measured: 2,
  analysis_in_sync: true,
};

/** The demo "next batch", in the proposal shape GET /api/latest returns. */
export const DEMO_BATCH: { recipe: Record<string, number>; pred: number; std: number; mode: "explore" | "exploit"; why: string }[] = [
  { recipe: { pH: 7.12, Temp_C: 36.2, Feed_pct: 3.4 }, pred: 5.68, std: 0.26, mode: "exploit", why: "highest predicted titer" },
  { recipe: { pH: 7.3, Temp_C: 35.6, Feed_pct: 3.9 }, pred: 5.52, std: 0.41, mode: "exploit", why: "extends the best region" },
  { recipe: { pH: 6.7, Temp_C: 37.6, Feed_pct: 2.9 }, pred: 5.01, std: 0.66, mode: "explore", why: "least-sampled region" },
];
