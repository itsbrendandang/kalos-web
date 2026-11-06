"use client";

import { useMemo } from "react";
import { orderBatch, targetIsNonNegative } from "@/components/campaign/plan-batch";
import {
  boundaryChecks,
  dataNotes,
  diversitySummary,
  groupFlags,
  observedRanges,
  sharedKinds,
  recipeFlags,
  stripDomain,
  type PlanAnalysis,
  type SetpointValue,
} from "@/components/campaign/plan-view";
import { targetName } from "@/components/campaign/target";
import { constraintNote, designBoxExclusionsNote, incumbentLabel, proposalIncumbent, proposalRecipe, modelVerdict } from "@/lib/api";
import { parseUnit } from "@/lib/utils";
import { recipeColumns } from "@/lib/recipe-identity";
import { parseSurface } from "@/components/campaign/plan/surface-model";
import { spreadSentences, uncheckedSentence, edgeSourcesSentence, searchLimitSentence } from "@/components/campaign/plan/copy";
import type { PlanContext, PlanRow } from "@/components/campaign/plan/types";

/**
 * Everything the Plan batch view derives from one analysis. Pure reads of the
 * engine's fields (see plan-view.ts and lib/api.ts); nothing is fetched here.
 */
export function useBatchModel(d: PlanAnalysis) {
  const name = targetName(d.target);
  const unit = parseUnit(d.target);
  const incumbent = proposalIncumbent(d);
  const band = d.conformal_q ?? null;
  const verdict = modelVerdict(d);
  const ranges = useMemo(() => observedRanges(d), [d]);
  const spread = useMemo(() => spreadSentences(d.batch_diversity, d.proposal_notice), [d.batch_diversity, d.proposal_notice]);

  const rows: PlanRow[] = useMemo(() => {
    const nonNegative = targetIsNonNegative(d.best, d.oof);
    return orderBatch(d.proposals, incumbent).map((item) => {
      const recipe = proposalRecipe(item.proposal, d.proposal_features) as Record<string, SetpointValue>;
      return {
        item,
        id: `P${item.rank}`,
        recipe,
        flags: recipeFlags(item.proposal, recipe, { incumbent, band, nonNegative, ranges, constraint: d.constraint }),
        checks: boundaryChecks(recipe, ranges),
        gain: incumbent == null ? null : item.proposal.pred - incumbent,
      };
    });
  }, [d, incumbent, band, ranges]);

  // Every input any recipe sets, in the sheet's order (the analysis' `features`), so Plan, Run, Record and Learn show the same columns (lib/recipe-identity.ts).
  const features = useMemo(() => recipeColumns(rows.map((r) => r.recipe), d.features, d.proposal_features), [rows, d.features, d.proposal_features]);

  const grouped = useMemo(() => groupFlags(rows.map((r) => ({ rank: r.item.rank, flags: r.flags }))), [rows]);
  const shared = useMemo(() => sharedKinds(grouped), [grouped]);

  const ctx: PlanContext = useMemo(
    () => ({
      target: name,
      unit,
      features,
      ranges,
      band,
      coverage: d.conformal_coverage,
      incumbent,
      incumbentLabel: incumbentLabel(d),
      domain: stripDomain(
        rows.map((r) => r.item.proposal.pred),
        band,
        incumbent,
      ),
      constraint: d.constraint,
      shared,
    }),
    [name, unit, d, features, ranges, band, incumbent, rows, shared],
  );
  const checkedInputs = useMemo(() => Object.keys(ranges).filter((k) => rows.some((r) => k in r.recipe)), [ranges, rows]);
  const uncheckedInputs = useMemo(
    () => features.filter((k) => !ranges[k] && rows.some((r) => typeof r.recipe[k] === "number")),
    [features, ranges, rows],
  );

  const surface = useMemo(() => parseSurface(d.response_surface), [d.response_surface]);
  const surfacePoints = useMemo(
    () =>
      surface == null
        ? []
        : rows.flatMap((r) => {
            const x = r.recipe[surface.x.name];
            const y = r.recipe[surface.y.name];
            return typeof x === "number" && typeof y === "number" ? [{ id: r.id, x, y }] : [];
          }),
    [rows, surface],
  );

  const diversity = diversitySummary(d.batch_diversity, d.proposal_notice);
  const searchLimit = designBoxExclusionsNote(d.design_box_exclusions);
  const constraint = constraintNote(d.constraint);

  return {
    name,
    unit,
    incumbent,
    band,
    verdict,
    ranges,
    /** Plain sentence on how many proposals the engine returned, or null when it sent nothing about it. */
    diversity,
    /** The engine's own strings for this batch, verbatim, for the Method disclosure. */
    rawDetails: [
      ...(diversity?.rawNotes ?? []),
      ...(constraint?.raw ? [`Constraint: ${constraint.raw}`] : []),
      ...(searchLimit ? [searchLimit] : []),
    ],
    spread,
    rows,
    ctx,
    grouped,
    checkedInputs,
    uncheckedInputs,
    surface,
    surfacePoints,
    /** Plain sentences for the Method tab: how the edge checks were run and what the engine narrowed. */
    checkSentences: [
      checkedInputs.length ? edgeSourcesSentence(checkedInputs, ranges) : null,
      uncheckedInputs.length ? uncheckedSentence(uncheckedInputs) : null,
      constraint?.plain,
      searchLimitSentence(d.design_box_exclusions),
    ].filter((s): s is string => s != null && s !== ""),
    dataNotes: dataNotes(d),
  };
}

export type BatchModel = ReturnType<typeof useBatchModel>;
