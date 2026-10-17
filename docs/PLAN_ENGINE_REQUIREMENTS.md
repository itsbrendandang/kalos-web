# Plan page: engine fields it needs

The redesigned Plan page (`app/campaign/plan/page.tsx`) shows only what the engine returns.
Where a field is missing, the page says so and does not fill the gap on the client.
This file lists the engine fields that would let the page say more, in priority order.
It is a request list, not an implementation: no engine code changes come with the web PR.

Checked against the engine branch `fix/constant-target-and-batch-diversity` (kalos-engine PR #87), `POST /api/run` and `GET /api/latest`.

## What the page uses today

| Page element | Engine field |
| --- | --- |
| Proposal id, order | `proposals[]` order, sorted client-side by `pred` (ids `P1..Pn` are display ranks; the engine index is kept for `POST /api/campaign/start`) |
| Setpoints | `proposals[].recipe` (falls back to `vals` + `proposal_features` on older engines) |
| Predicted value | `proposals[].pred`, labelled "predicted", hollow ring |
| Interval | `pred ± conformal_q`, labelled with `conformal_coverage` ("90% band"); shown only when `conformal_q` is present |
| Model SD | `proposals[].std`, in Details only, labelled as the model's own spread |
| Why proposed | `proposals[].mode`, plus `reason` verbatim in Details |
| Chance it produces | `proposals[].p_feasible`, only when present |
| Constraint | `constraint`, `proposals[].pred_<column>`, `proposal_gating` |
| Best measured | `best`, or `noise.best_reproducible` for replicate-aware fits (`proposalIncumbent`) |
| Model status | `reliability.spearman`, `ci95`, `clears_floor`, `ci_excludes_zero` (`reliabilityVerdict`) |
| Batch diversity | `batch_diversity`, `proposal_notice` (PR #87); the page says "not reported" when both are absent |
| Edge-of-range checks | min/max of `response_surface.runs` for its two plotted inputs; `feature_ranges` for others when present |
| Sheet precision | decimal places of the values in `response_surface.runs` |
| Constant target | `code: "target_constant"`, `target`, `target_summary`, `available_targets` on the 400 body of `POST /api/run` |

## Requested fields

### 1. Observed range for every input (`observed_ranges`)

**Why.** Edge-of-range warnings must come from real data.
Today only the two inputs in `response_surface.runs` have an observed range; every other input (for `good.csv`, `Methanol`) is not checked, and the page says so.
`feature_ranges` is typed in the web client but is absent on current engines, and it is described as the search range, which may differ from the observed range after `design_box_exclusions`.

**Shape.** `observed_ranges: { [input]: { min: number, max: number, n: number } }` for every continuous input, from the rows the model was fit on.
Categorical inputs: `{ levels: string[] }`.

### 2. Display precision and units per input (`input_display`)

**Why.** The page infers decimals from the observed values of two inputs and falls back to 2 decimals for the rest. Units are parsed from column names only.

**Shape.** `input_display: { [input]: { decimals: number, unit: string | null } }`.

### 3. Per-proposal prediction intervals (`proposals[].interval`)

**Why.** `conformal_q` is one half-width for the whole batch, so every proposal shows the same band width, which the page states.
A per-recipe calibrated interval would let the page show where the model is less sure.

**Shape.** `proposals[].interval: { lo: number, hi: number, coverage: number, method: string }`.

### 4. Distance to the nearest measured run (`proposals[].nearest_run`)

**Why.** The page cannot say how far a proposal is from anything tried, only whether one input is at an edge.

**Shape.** `proposals[].nearest_run: { run_id: string | null, distance: number, metric: string }`, distance on the same scale as `batch_diversity.min_separation`.

### 5. Pairwise separation inside the batch (`batch_diversity.pairs`)

**Why.** `batch_diversity` gives the minimum separation and the number of near-duplicates replaced, but not which pairs are closest.
The comparison view could then say "P1 and P2 are the closest pair".

**Shape.** `batch_diversity.pairs: [i, j, separation][]`, indices into `proposals`.

### 6. Machine-readable proposal reasons (`proposals[].reason_code`)

**Why.** `reason` is a human string with the model SD inside it ("diversifies the batch (predicted 47.6, ±0.706)").
The page shows it verbatim in Details only and explains `mode` in its own words.

**Shape.** `proposals[].reason_code: "predicted_high" | "reduce_uncertainty" | "diversify"`, plus `proposals[].reason_values: { gain?: number, std?: number }`.

### 7. Per-check promotion status (`promotion.checks`)

**Why.** `promotion.failures` are strings; "unmeasured" has to be found by substring match (`isUnmeasuredFailure`).

**Shape.** `promotion.checks: { name: string, status: "passed" | "failed" | "unmeasured", value: number | null, threshold: number | null }[]`.

### 8. The last rejected upload (`GET /api/latest` → `last_rejection`)

**Why.** When an upload is rejected (for example `target_constant`), the engine keeps the previous analysis.
The web app remembers the rejection in memory for the browser session (`useLastRejection`), so after a reload Plan can no longer say that the batch on screen is from the earlier file.

**Shape.** `last_rejection: { at: number, filename: string, code: string, target?: string, target_summary?: object } | null`, cleared by the next accepted upload.

### 9. Best value including recorded results not yet folded in

**Why.** Audit gap (h): the best measured value can lag recorded results until Learn re-analyzes.
Plan shows the analysis's `best`, labelled as the best measured run of that analysis.

**Shape.** `campaign.best_recorded: { value: number, run_id: string, in_model: boolean }`.

## Not requested

- No performance claims for the optimizer.
  The page states it has not been validated against lab outcomes; it should keep saying so until a validation study exists, whatever fields are added.
