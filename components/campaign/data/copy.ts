// Plain sentences for the Your data figures that are not part of the markup. Pure, so the wording is tested.
import type { Gap } from "@/components/campaign/data/profile";
import { dataNumber } from "@/components/campaign/data/svg";

/** The tested-range sentence: which stretches no run covered (up to three named), or that none did. */
export function gapSentence(gaps: Gap[], range: { min: number; max: number } | null): string {
  if (!range) return "Only one value in this sheet, so no range to test.";
  if (gaps.length === 0) return "Runs cover the range with no stretch wider than a tenth of it untested.";
  const named = gaps.slice(0, 3).map((g) => `${dataNumber(g.from)} to ${dataNumber(g.to)}`);
  const more = gaps.length > 3 ? `, and ${gaps.length - 3} more` : "";
  return `Untested: no runs between ${named.join(", ")}${more}.`;
}
