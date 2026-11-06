import type { ReadoutResult } from "@/lib/scale-readout";
import { formatNumber } from "@/lib/format";

/** Plain words for each gate check the engine can fail (kalos docs/SCALE_READOUT.md). */
const CHECK_WORDS: Record<string, string> = {
  required_columns: "the sheet is missing a column it needs",
  min_distinct_scales: "the sheet covers too few different scales",
  non_finite_dropped_fraction: "too many rows have missing or unreadable values",
  target_not_interpolation: "the target scale is not larger than every scale in the sheet",
  target_ratio_hard_cap: "the target scale is too far beyond the largest scale in the sheet",
  invalid_target: "the target it was given was not valid",
};

/** The failed check in plain words, or a generic phrase for a check this page has no words for. */
export function failedCheckWords(check: string): string {
  return CHECK_WORDS[check] ?? "one of its checks did not pass";
}

export function isKnownCheck(check: string): boolean {
  return check in CHECK_WORDS;
}

/** The one sentence under the header once the engine has answered. */
export function readoutVerdict(result: ReadoutResult, scaleL: number | null): string {
  switch (result.kind) {
    case "html":
      return scaleL != null && Number.isFinite(scaleL)
        ? `The engine produced a readout for ${formatNumber(scaleL, "count")} L.`
        : "The engine produced a readout.";
    case "gate":
      return `The engine declined: ${failedCheckWords(result.failedCheck)}.`;
    case "busy":
      return result.retryAfterSeconds != null
        ? `The engine is busy; try again in ${formatNumber(result.retryAfterSeconds, "count")} s.`
        : "The engine is busy; try again in a moment.";
    case "auth":
      return "The engine refused the request as not authorized.";
    case "upload":
      return "The engine rejected the upload.";
    case "unavailable":
      return "The engine did not answer.";
  }
}
