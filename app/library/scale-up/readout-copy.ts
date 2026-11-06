import type { ReadoutResult } from "@/lib/scale-readout";
import { formatNumber } from "@/lib/format";

/** Plain words for each check Kalos can fail before it answers (kalos docs/SCALE_READOUT.md). */
const CHECK_WORDS: Record<string, string> = {
  required_columns: "the sheet is missing a column it needs",
  min_distinct_scales: "the sheet covers too few different scales",
  non_finite_dropped_fraction: "too many runs have missing or unreadable values",
  target_not_interpolation: "the scale you asked for is not larger than every scale in the sheet",
  target_ratio_hard_cap: "the scale you asked for is too far beyond the largest scale in the sheet",
  invalid_target: "the recipe or scale it was given was not valid",
};

/** The failed check in plain words, or a generic phrase for a check this page has no words for. */
export function failedCheckWords(check: string): string {
  return CHECK_WORDS[check] ?? "one of its checks did not pass";
}

export function isKnownCheck(check: string): boolean {
  return check in CHECK_WORDS;
}

/** The one sentence under the header once Kalos has answered. */
export function readoutVerdict(result: ReadoutResult, scaleL: number | null): string {
  switch (result.kind) {
    case "html":
      // The readout is Kalos's own document and may itself be a refusal, so the sentence does not claim a prediction.
      return scaleL != null && Number.isFinite(scaleL)
        ? `Kalos's answer for ${formatNumber(scaleL, "count")} L is below. It says whether a prediction was possible, and what it would take if not.`
        : "Kalos's answer is below. It says whether a prediction was possible, and what it would take if not.";
    case "gate":
      return `Kalos could not answer: ${failedCheckWords(result.failedCheck)}.`;
    case "busy":
      return result.retryAfterSeconds != null
        ? `Kalos is busy; try again in ${formatNumber(result.retryAfterSeconds, "count")} s.`
        : "Kalos is busy; try again in a moment.";
    case "auth":
      return "Kalos could not confirm who you are, so it did not answer.";
    case "upload":
      return "Kalos could not read the file as a run sheet.";
    case "unavailable":
      return "Could not reach Kalos.";
  }
}
