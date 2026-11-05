import type { BatchItem } from "@/components/campaign/plan-batch";
import type { BoundaryCheck, ObservedRange, RecipeFlag, SetpointValue } from "@/components/campaign/plan-view";
import type { ConstraintReport } from "@/lib/api";

/** One proposed experiment, with everything the page derived for it. */
export type PlanRow = {
  item: BatchItem;
  /** "P1": the displayed id, by rank. */
  id: string;
  recipe: Record<string, SetpointValue>;
  flags: RecipeFlag[];
  checks: BoundaryCheck[];
  gain: number | null;
};

/** What every row shares. */
export type PlanContext = {
  target: string;
  unit: string;
  /** The engine's `proposal_features`: one column each. */
  features: string[];
  /** Every other input any recipe sets, A-Z: shown in Details. */
  others: string[];
  ranges: Record<string, ObservedRange>;
  band: number | null;
  coverage: number | undefined;
  incumbent: number | null;
  incumbentLabel: string;
  domain: [number, number] | null;
  constraint: ConstraintReport | null | undefined;
};

/** Per-row state the page owns and the row components render. */
export type RowState = {
  included: boolean;
  onInclude: () => void;
  compared: boolean;
  /** Disabled when five are already selected for comparison. */
  compareDisabled: boolean;
  onCompare: () => void;
  expanded: boolean;
  onExpand: () => void;
};

export type SetRowState = (row: PlanRow) => RowState;

export type { BoundaryCheck, ObservedRange, RecipeFlag, SetpointValue };
