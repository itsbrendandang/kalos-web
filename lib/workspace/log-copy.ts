// Pure copy derivation for the Log tab's verdict hero. Kept out of the
// component so the sentences it puts in front of a scientist are unit-tested
// rather than assembled inline in JSX.
//
// The design's headline ("The model ranks recipes reliably, but not their
// exact titer.") is a CLAIM about the current fit, so it cannot be a static
// string: it only holds when the engine's own reliability verdict
// (lib/api.ts's isReliable) is true, and the noun at the end is the campaign's
// target, not always "titer". Every branch below states what the engine
// actually reports - there is no branch that overclaims.
import { fmt, num } from "@/lib/utils";
import type { WorkspaceLogStats } from "./log-types";

const SMALL_NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Spells small counts the way the design copy does ("These six should
 *  move..."), falling back to digits past ten. */
export function spellCount(n: number): string {
  return n >= 0 && n <= 10 ? SMALL_NUMBERS[n] : String(n);
}

/** The bare noun for a campaign target: "CHO titer (g/L)" -> "titer". Used
 *  as the last word of the verdict headline. Falls back to "value" rather
 *  than guessing when the target name has no usable word. */
export function targetNoun(target: string | null): string {
  if (!target) return "value";
  const withoutUnit = target.replace(/\([^)]*\)\s*$/, "").trim();
  const word = withoutUnit.split(/\s+/).filter(Boolean).pop() ?? "";
  const cleaned = word.replace(/[^A-Za-z]/g, "");
  if (cleaned.length === 0) return "value";
  // Keep acronyms upper ("OD", "IgG"), lowercase ordinary words.
  return cleaned === cleaned.toUpperCase() && cleaned.length <= 4 ? cleaned : cleaned.toLowerCase();
}

export type VerdictCopy = {
  headline: string;
  /** The first sentence of the sub-paragraph - always true of whatever the
   *  engine reported, never conditional on numbers being present. */
  lead: string;
  /** The second sentence's numerals, when there is a real batch of proposals
   *  with real predictions to describe. Null means the sentence is omitted
   *  entirely rather than rendered with placeholder numbers. */
  movement: { count: string; best: string; predicted: string } | null;
};

/** The reliability pill's label and tone. `unknown` is a real third state
 *  (the engine has an analysis but never scored held-out correlation), not a
 *  fallback for missing data. */
export function reliabilityBadge(reliable: boolean | null): { label: string; tone: "good" | "warn" | "unknown" } {
  if (reliable === true) return { label: "Reliable for ranking", tone: "good" };
  if (reliable === false) return { label: "Not reliable for ranking", tone: "warn" };
  return { label: "Reliability not scored", tone: "unknown" };
}

/** The mono meta line under the badge: correlation, its interval, the source
 *  file, and the analysis age. Every segment is dropped rather than faked
 *  when the engine did not report it, so a short line means "we know less",
 *  never "this is zero". */
export function verdictMeta(
  stats: Pick<WorkspaceLogStats, "cvSpearman" | "ci95" | "dataset" | "updatedAt">,
  age: string | null,
): string[] {
  const parts: string[] = [];
  if (stats.cvSpearman != null) parts.push(`ρ ${num(stats.cvSpearman, 2)}`);
  if (stats.ci95) parts.push(`CI ${num(stats.ci95[0], 2)}–${num(stats.ci95[1], 2)}`);
  if (stats.dataset) parts.push(stats.dataset);
  if (stats.updatedAt != null && age) parts.push(age);
  return parts;
}

export function verdictCopy(
  stats: WorkspaceLogStats,
  proposals: { predicted: number | null }[],
): VerdictCopy {
  const noun = targetNoun(stats.target);
  const unit = stats.targetUnit ? ` ${stats.targetUnit}` : "";

  const predictions = proposals.map((p) => p.predicted).filter((v): v is number => v != null);
  const topPredicted = predictions.length > 0 ? Math.max(...predictions) : null;
  const movement =
    proposals.length > 0 && stats.bestSoFar != null && topPredicted != null && topPredicted > stats.bestSoFar
      ? {
          count: spellCount(proposals.length),
          best: fmt(stats.bestSoFar, 1),
          predicted: `${fmt(topPredicted, 1)}${unit}`,
        }
      : null;

  if (stats.reliable === true) {
    return {
      headline: `The model ranks recipes reliably, but not their exact ${noun}.`,
      lead: "Read the predictions as an ordering, not a promise.",
      movement,
    };
  }
  if (stats.reliable === false) {
    return {
      headline: `The model does not rank recipes reliably yet.`,
      lead: "Held-out correlation has not cleared the floor, so treat this batch as a way to learn the response, not as ranked bets.",
      movement,
    };
  }
  return {
    headline: `Reliability has not been scored for this fit.`,
    lead: "Without a held-out correlation there is nothing to say about how well the ordering holds. Re-run the analysis to score it.",
    movement: null,
  };
}
