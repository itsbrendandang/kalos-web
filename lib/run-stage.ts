/*
 * Wording for the Run stage, tested in __tests__/stage-pages.test.ts.
 */
import type { CampaignRun } from "@/lib/api";
import { formatBand, formatNumber } from "@/lib/format";

/**
 * The one sentence over the runs table: how many runs are still out, and what
 * the model expects of them (the mean prediction, with the analysis' band when
 * there is one; never the model's own std).
 */
export function runVerdict(runs: readonly CampaignRun[], awaiting: number, target: string, band: { halfWidth: number; coverage?: number | null } | null): string {
  const n = runs.length;
  const mean = runs.reduce((a, r) => a + r.pred, 0) / Math.max(1, n);
  const expects = `the model expects ${target} around ${formatNumber(mean)}${band ? ` ${formatBand(band.halfWidth, band.coverage)}` : ""}`;
  if (awaiting === 0) return `All ${formatNumber(n, "count")} runs are back; ${expects}.`;
  return `${formatNumber(awaiting, "count")} of ${formatNumber(n, "count")} runs ${awaiting === 1 ? "is" : "are"} still in the lab; ${expects}.`;
}
