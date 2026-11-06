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

export { trustNumbers } from "@/components/campaign/trust-numbers";

/** The one trust sentence the page leads with. */
export function trustSentence(v: ReliabilityVerdict): string {
  switch (v.state) {
    case "reliable":
      return "The model put your past runs in the right order most of the time, so the order of these recipes is worth following.";
    case "not-yet":
      return "The model has not yet shown that it puts past runs in the right order, so treat this order as a rough guide.";
    default:
      return "There are too few measured runs to tell whether the model puts them in the right order.";
  }
}

export function trustTone(v: ReliabilityVerdict): Tone {
  if (v.state === "reliable") return "good";
  if (v.state === "not-yet") return "warn";
  return "neutral";
}

/** How far apart the proposals are, in plain words. The engine's metric definition stays under Method. */
export function spreadSentences(div: BatchDiversity | null | undefined, notice: ProposalNotice | null | undefined): string[] {
  const out: string[] = [];
  const sep = div?.min_separation ?? notice?.min_separation;
  if (sep != null && Number.isFinite(sep)) out.push(`Kalos keeps proposed recipes at least ${formatNumber(sep, "pct")} apart on the input ranges.`);
  if (div && div.near_duplicates_replaced > 0) {
    const n = div.near_duplicates_replaced;
    out.push(`It replaced ${formatNumber(n, "count")} near-duplicate ${n === 1 ? "recipe" : "recipes"}.`);
  }
  if (notice?.code === "fewer_distinct_candidates") out.push("No further recipe was far enough from the others, so this round has fewer than you asked for.");
  else if (notice) out.push("Kalos sent a note about this round. Its details are under Method.");
  return out;
}

/** Which range each checked input is compared with: the allowed range, or the values tried in the measured runs. */
export function edgeSourcesSentence(inputs: string[], ranges: Record<string, ObservedRange>): string {
  const allowed = inputs.filter((k) => ranges[k]?.source === "engine");
  const observed = inputs.filter((k) => ranges[k]?.source === "observed");
  const parts = [
    allowed.length ? `the allowed range for ${allowed.join(" and ")}` : null,
    observed.length ? `the values tried in the measured runs for ${observed.join(" and ")}` : null,
  ].filter(Boolean);
  return `Edge-of-range checks use ${parts.join(", and ")}.`;
}

export function uncheckedSentence(inputs: string[]): string {
  if (inputs.length === 0) return "";
  const list = inputs.join(", ");
  return inputs.length === 1 ? `No range is reported for ${list}, so it is not checked at the edges.` : `No ranges are reported for ${list}, so they are not checked at the edges.`;
}

/**
 * The search-box limit in plain words. The engine's own wording ("design box")
 * is kept out of the sentence; the raw note goes to the Method disclosure.
 */
export function searchLimitSentence(exclusions: { column: string; lower: number; upper: number; n_excluded: number }[] | null | undefined): string | null {
  if (!exclusions || exclusions.length === 0) return null;
  const parts = exclusions.map((e) => `${e.column} from ${formatNumber(e.lower)} to ${formatNumber(e.upper)} (${formatNumber(e.n_excluded, "count")} ${e.n_excluded === 1 ? "run" : "runs"} left out)`);
  return `The search was limited to a narrower range for ${exclusions.length} ${exclusions.length === 1 ? "input" : "inputs"}: ${parts.join("; ")}.`;
}
