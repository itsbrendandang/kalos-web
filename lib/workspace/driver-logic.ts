// Pure logic behind the "What round N taught" card (design spec 1.3.G).
//
// The design handoff ships no chart for this card - only a dashed placeholder
// labelled "signed driver chart / 11 inputs, CI bars" (gap list item 4). The
// chart it stands in for is designed in components/workspace/log/driver-chart.tsx;
// everything numeric it renders is derived here so it can be unit-tested.
//
// The one rule this module exists to enforce: the engine reports TWO different
// quantities about inputs, and they must never be merged into a single
// ranking.
//
//   * `drivers[]` - a signed Spearman rank correlation between one input and
//     the target, computed from the runs themselves with no model fit
//     involved, carrying a bootstrap 95% interval and the engine's own
//     `significant` flag (true iff that interval excludes zero).
//   * `gp_main_effects` - relative importance read off the FITTED surrogate's
//     per-dimension ARD lengthscales. A model estimate. Unitless, unsigned,
//     and only comparable within its own list.
//
// One is a measurement of the data, the other is a property of a model of the
// data. They can disagree, and when they do that disagreement is information -
// so this module surfaces it rather than smoothing it away.
import type { Driver, GpMainEffect, GpMainEffects } from "@/lib/api";
import { num } from "@/lib/utils";
import { spellCount } from "./log-copy";

/** Spelled counts open several of the findings below, and a sentence does not
 *  start lowercase. */
function sentenceCase(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** One row of the signed raw-data panel. */
export type DriverBar = {
  name: string;
  rho: number;
  ciLow: number;
  ciHigh: number;
  significant: boolean;
};

/** One row of the model-estimate panel. `relative` is the importance rescaled
 *  so the strongest input in the list is 1 - the raw ARD number has no
 *  absolute meaning, so a bar length drawn from it would imply a precision
 *  that isn't there. */
export type EffectBar = { name: string; importance: number; relative: number };

/** Strongest-first by ABSOLUTE correlation: a driver at -0.58 is a stronger
 *  lever than one at +0.36, and sorting by signed value would bury it at the
 *  bottom of the chart. */
export function rankedDrivers(drivers: Driver[], limit?: number): DriverBar[] {
  const bars = [...drivers]
    .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho))
    .map((d) => ({
      name: d.name,
      rho: d.rho,
      ciLow: d.ci95[0],
      ciHigh: d.ci95[1],
      significant: d.significant,
    }));
  return limit != null ? bars.slice(0, limit) : bars;
}

export function rankedEffects(effects: GpMainEffect[], limit?: number): EffectBar[] {
  const max = Math.max(0, ...effects.map((e) => e.importance));
  const bars = [...effects]
    .sort((a, b) => b.importance - a.importance)
    .map((e) => ({
      name: e.name,
      importance: e.importance,
      // A zero-importance list (every lengthscale identical) would divide by
      // zero; render flat bars rather than NaN widths.
      relative: max > 0 ? e.importance / max : 0,
    }));
  return limit != null ? bars.slice(0, limit) : bars;
}

/** Whether the two rankings put the same input first. Null when either side
 *  has nothing to rank - the card then says nothing about agreement rather
 *  than implying the model was silent on purpose. */
export function topDriverAgreement(
  drivers: Driver[],
  gp: GpMainEffects | null,
): { agree: boolean; dataTop: string; modelTop: string } | null {
  if (!gp || !gp.available) return null;
  const dataTop = rankedDrivers(drivers, 1)[0]?.name;
  const modelTop = rankedEffects(gp.effects, 1)[0]?.name;
  if (!dataTop || !modelTop) return null;
  return { agree: dataTop === modelTop, dataTop, modelTop };
}

export type Finding = { headline: string; support: string };

/** The card's prose column. The design's own bullets ("Day 4 → day 2 is worth
 *  roughly +1.2 g/L") are causal, per-unit effect claims the engine does not
 *  produce - a rank correlation cannot be converted into "worth +1.2 g/L".
 *  These say what the engine actually reports, with the numbers it reports. */
export function driverFindings(drivers: Driver[], gp: GpMainEffects | null): Finding[] {
  if (drivers.length === 0) return [];

  const ranked = rankedDrivers(drivers);
  const significant = ranked.filter((d) => d.significant);
  const findings: Finding[] = [];

  const top = ranked[0];
  if (top.significant) {
    findings.push({
      headline: `${top.name} is the strongest measured lever.`,
      support: `Spearman ρ ${num(top.rho, 2)}, 95% interval ${num(top.ciLow, 2)} to ${num(top.ciHigh, 2)}. Raising it ${top.rho > 0 ? "raises" : "lowers"} the target across the runs on record.`,
    });
  } else {
    findings.push({
      headline: "No single input separates from noise yet.",
      support: `The strongest, ${top.name}, sits at ρ ${num(top.rho, 2)} with an interval from ${num(top.ciLow, 2)} to ${num(top.ciHigh, 2)} that still crosses zero.`,
    });
  }

  findings.push({
    headline: `${sentenceCase(spellCount(significant.length))} of ${ranked.length} inputs clear the noise floor.`,
    support:
      significant.length === ranked.length
        ? "Every interval excludes zero, so every input has an established sign."
        : `The other ${spellCount(ranked.length - significant.length)} have 95% intervals that cross zero. Their sign is not established, so the ordering below does not claim one.`,
  });

  if (gp && !gp.available) {
    findings.push({
      headline: "The model has no per-input estimate to compare against.",
      support: gp.reason,
    });
    return findings;
  }

  const agreement = topDriverAgreement(drivers, gp);
  if (agreement) {
    findings.push({
      headline: agreement.agree
        ? "The fitted model leads with the same input."
        : "The fitted model leads with a different input.",
      support: agreement.agree
        ? `GP importance and the raw correlation both rank ${agreement.dataTop} first. They are still two different quantities, and agreeing here does not make either one a causal claim.`
        : `GP importance ranks ${agreement.modelTop} first; the raw correlation ranks ${agreement.dataTop} first. A model estimate and a data statistic are allowed to disagree, and neither is corrected by the other.`,
    });
  }

  return findings;
}
