import { CloneChip } from "@/components/viz/clone-chip";
import type { CampaignRun } from "@/lib/api";
import { cloneOfRecipe, type CloneKey } from "@/lib/viz-data/clones";

/**
 * SV-G5 on a run row: the clone the run's recipe names, filled once a result is
 * measured and hollow while it is awaiting. Nothing when the analysis has no
 * clone column or the recipe names none.
 */
export function RunClone({ run, clone }: { run: Pick<CampaignRun, "recipe" | "result" | "awaiting">; clone: CloneKey | null }) {
  const label = cloneOfRecipe(run.recipe, clone);
  if (!label || !clone) return null;
  const measured = run.result != null && !run.awaiting;
  return <CloneChip glyph={clone.glyphs.get(label) ?? { label, color: null, shape: null }} filled={measured} className="mt-1 flex w-fit font-sans" />;
}
