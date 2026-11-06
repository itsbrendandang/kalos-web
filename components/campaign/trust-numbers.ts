// plain-words: disclosure-only
/*
 * The numbers behind the trust verdict (lib/api reliabilityVerdict), for the
 * "How the model was scored" disclosure on Overview, Plan and Learn. These
 * sentences carry the statistics words on purpose and are never shown on the
 * main surface.
 */
import type { ReliabilityVerdict } from "@/lib/api";
import { formatNumber } from "@/lib/format";

/** "Rank agreement (Spearman) 0.65 on held-out runs, 95% interval 0.41 to 0.80, trust floor 0.50." or null when nothing was scored. */
export function trustNumbers(v: ReliabilityVerdict): string | null {
  if (v.rho == null) return null;
  const parts = [`Rank agreement (Spearman) ${formatNumber(v.rho, "corr")} on held-out runs`];
  if (v.ci) parts.push(`95% interval ${formatNumber(v.ci[0], "corr")} to ${formatNumber(v.ci[1], "corr")}`);
  if (v.floor != null) parts.push(`trust floor ${formatNumber(v.floor, "corr")}`);
  return `${parts.join(", ")}.`;
}

/** What the rank-agreement number means, one click down. */
export const RANK_AGREEMENT_GLOSS = "1 means the model put every held-out run in the right order, 0 means no better than chance. Each held-out run was predicted by a model that had not seen it.";
