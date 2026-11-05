/*
 * Plain-language sentences for the Plan page. Every string the page shows in
 * prose comes from here or from a Kalos-written helper; raw engine values
 * (metric definitions, notice codes, the engine's own reason text) are only
 * ever passed through to a disclosure, never into a sentence.
 */

import type { Tone } from "@/components/kit/tone";
import type { BatchDiversity, ObservedRange, ProposalNotice } from "@/components/campaign/plan-view";
import type { ReliabilityVerdict } from "@/lib/api";
import { formatNumber } from "@/lib/format";

/** The one trust sentence the page leads with. */
export function trustSentence(v: ReliabilityVerdict): string {
  switch (v.state) {
    case "reliable":
      return "The model ranks past runs reliably, so its order for this batch is worth following.";
    case "not-yet":
      return "The model has not yet shown that it ranks past runs reliably, so treat this order as a rough guide.";
    default:
      return "There are too few measured runs to tell how well the model ranks them.";
  }
}

export function trustTone(v: ReliabilityVerdict): Tone {
  if (v.state === "reliable") return "good";
  if (v.state === "not-yet") return "warn";
  return "neutral";
}

/** The numbers behind the trust sentence, for the disclosure under it. */
export function trustNumbers(v: ReliabilityVerdict): string | null {
  if (v.rho == null) return null;
  const parts = [`Rank agreement ${formatNumber(v.rho, "corr")}`];
  if (v.ci) parts.push(`95% interval ${formatNumber(v.ci[0], "corr")} to ${formatNumber(v.ci[1], "corr")}`);
  if (v.floor != null) parts.push(`trust floor ${formatNumber(v.floor, "corr")}`);
  return `${parts.join(", ")}.`;
}

/** How far apart the proposals are, in plain words. The engine's metric definition stays under Method. */
export function spreadSentences(div: BatchDiversity | null | undefined, notice: ProposalNotice | null | undefined): string[] {
  const out: string[] = [];
  const sep = div?.min_separation ?? notice?.min_separation;
  if (sep != null && Number.isFinite(sep)) out.push(`The engine keeps proposals at least ${formatNumber(sep, "pct")} apart on the input ranges.`);
  if (div && div.near_duplicates_replaced > 0) {
    const n = div.near_duplicates_replaced;
    out.push(`It replaced ${formatNumber(n, "count")} near-duplicate ${n === 1 ? "proposal" : "proposals"}.`);
  }
  if (notice?.code === "fewer_distinct_candidates") out.push("No further candidate was far enough from the others, so the batch is shorter than requested.");
  else if (notice) out.push("The engine sent a notice about this batch. Its details are under Method.");
  return out;
}

/** Which range each checked input is compared with: the engine's ranges, or the values tried in the measured runs. */
export function edgeSourcesSentence(inputs: string[], ranges: Record<string, ObservedRange>): string {
  const engine = inputs.filter((k) => ranges[k]?.source === "engine");
  const observed = inputs.filter((k) => ranges[k]?.source === "observed");
  const parts = [
    engine.length ? `the engine's range for ${engine.join(" and ")}` : null,
    observed.length ? `the values tried in the measured runs for ${observed.join(" and ")}` : null,
  ].filter(Boolean);
  return `Edge-of-range checks use ${parts.join(", and ")}.`;
}

export function uncheckedSentence(inputs: string[]): string {
  if (inputs.length === 0) return "";
  const list = inputs.join(", ");
  return inputs.length === 1 ? `The engine returns no range for ${list}, so it is not checked at the edges.` : `The engine returns no ranges for ${list}, so they are not checked at the edges.`;
}
