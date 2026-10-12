/*
 * Chart data for the campaign Overview, kept pure so it is tested
 * (__tests__/overview.test.ts) and reused by Learn.
 */

import type { Driver } from "@/lib/api";
import type { ActiveCampaign } from "@/lib/workbench";

export type DriverBar = {
  name: string;
  rho: number;
  /** [below, above] distances from rho to its 95% CI ends, the shape recharts' ErrorBar takes. */
  ci: [number, number];
  lo: number;
  hi: number;
  significant: boolean;
};

/** The strongest `k` drivers by |rho|, strongest first. `significant` is the engine's verdict, never re-derived. */
export function topDrivers(drivers: Driver[], k = 6): DriverBar[] {
  return [...drivers]
    .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho))
    .slice(0, k)
    .map((d) => ({
      name: d.name,
      rho: d.rho,
      ci: [Math.max(0, d.rho - d.ci95[0]), Math.max(0, d.ci95[1] - d.rho)],
      lo: d.ci95[0],
      hi: d.ci95[1],
      significant: d.significant,
    }));
}

/** Measured best-so-far per round (round 0 is the uploaded data). Rounds with no measured best stay as gaps. */
export function bestSoFarSeries(c: ActiveCampaign): { round: number; best: number | null; runs: number }[] {
  return c.history.map((h) => ({ round: h.round, best: h.best, runs: h.n_base }));
}
