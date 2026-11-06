# Kalos plain-words glossary

Source of truth for every word a user sees in kalos-web (branch `redesign-notion`). The reader is a lab scientist, not a statistician or a software person. Rules, then the vocabulary, then the term-by-term replacements, then the why-lines by code (mirrored by the engine in `kalos/assist/why.py` and by the assistant).

## Rules

1. A general-audience reader understands every sentence on first read. One idea per sentence.
2. Say what a number means for the lab, not how it was computed. "The model put past runs in the right order most of the time" on the surface; "Spearman 0.81, 95% interval 0.72 to 0.87" one click down.
3. The main surface has no statistics vocabulary and no software vocabulary (the banned list below). These words may appear only inside a disclosure: a `<Disclosure>` subtree, the `detail` prop of `<Verdict>`, the `method` prop of `<ChartFrame>`, a `<TooltipContent>`, or a module whose first lines carry the marker comment `// plain-words: disclosure-only`. `__tests__/plain-words.test.ts` fails the build otherwise.
4. Keep the exact engine text (codes, metric names, its own sentences) in disclosures only, with a human label next to it.
5. Numbers are rounded to what the lab can act on: a measured value to the sheet's precision, a share to a whole percent, a count as a count. Never "0.8123".
6. A button says what happens next, with a verb: "Start these 5 runs", "Save the results", "Upload a different sheet". Never "Approve", "Submit", "OK", "Confirm".
7. Never make a claim stronger than the current text. Plain words must not turn an association into a cause ("went with", never "drives", "causes", "improves", "because") or a model estimate into a measurement. "Measured" and "Predicted" stay labelled explicitly everywhere a number of either kind appears.
8. Banned words from DESIGN.md still hold: validated, GMP, Part 11, compliant, digital twin, real-time, design space.
9. No unexplained abbreviations. "CSV" and "pH" are fine; "CI", "SD", "OOF", "FDR", "AUC", "ECE", "SHA" are not.
10. **Why this matters.** Every verdict, warning, finding and next step carries one line that says what it means for the lab's work and what goes wrong if ignored. For verdicts and warnings it sits directly under the sentence (plain text, muted, prefixed "Why this matters:"); for lower-priority findings it sits inside the "Why" disclosure. The lines live in `lib/why.ts` (`WHY` by code; `whyLine(code)`), one per finding code / verdict state, and `__tests__/why-lines.test.ts` fails if a code mapped to words has none.

## One name for each thing

| Thing | Use | Never (in prose) |
| --- | --- | --- |
| One row of the sheet, one go in the lab | **run** | experiment, trial, observation, sample, row (except "row 12 of the sheet" when pointing at a literal row) |
| The settings of one run | **recipe** | setpoints, conditions, configuration, candidate, proposal (say "proposed recipe") |
| One planning cycle | **round** | batch, iteration, campaign step. "fed-batch" as a process word is fine |
| The uploaded table of runs | **run sheet** on first mention, then **sheet** | file (only for the thing on disk: ".xlsx file", "over 5 MB"), dataset, data set, data, table |
| The whole optimisation | **campaign** | project, study, loop |
| The thing Kalos learns from the runs | **the model** | surrogate, GP, optimizer, fit, estimator |
| The service that does the work | **Kalos** | engine, analysis engine, analysis service, backend, server, API |
| What is being raised | **the target** (and its name: Titer) | objective, response, outcome, KPI, y |
| Columns the model may change | **inputs** | features, factors, parameters, x, process inputs |
| Runs started and not yet measured | **runs in the lab** / **waiting for a result** | in flight, pending, awaiting, outstanding |
| The model's number for a recipe | **predicted** (always labelled) | estimate, forecast, mean, expectation |
| The number from the lab | **measured** (always labelled) | observed, actual, result (fine as "the result you measured") |
| ± on a prediction | **likely range** | prediction band, interval, band, CI, conformal |
| Patterns between an input and the target | **went with** / **what goes with higher Titer** | correlation, driver, effect, association, significant |
| Same recipe run again | **repeat** / **repeated runs** | replicate (fine inside a disclosure; "replicate" on the surface only in "replicate wells" on Review) |
| The engine's quality check of the sheet | **sheet check** | validation, data quality report |
| Kalos learning from a sheet | **Kalos reads the sheet and builds the model** / **the model learns from your runs** | fit, re-fit, train, analyze, re-analyze |
| Re-doing that with new results | **update the model** | refit, re-analyze, retrain |
| The page that shows the runs Kalos suggests | **Plan** ; the list is **proposed recipes** | batch, proposals, recommendations, candidates |
| Starting them | **Start these runs** | approve, submit, launch, commit |
| Learn verdict levels | **Reliable** / **Not yet reliable** / **Not enough runs to tell** | calibrated, promoted, gated |

## Term by term

Format: technical term → plain replacement. "Disclosure only" means the term may still appear one click down, with a label.

### Statistics

| Technical | Plain (main surface) | Disclosure only |
| --- | --- | --- |
| held-out runs, out-of-fold, cross-validation | "runs it had not seen" / "past runs it was tested on" | "Tested on held-out runs (each predicted by a model that had not seen it)" |
| rank agreement, rank correlation, Spearman, rho, 0.81 | "The model put past runs in the right order most of the time" (reliable) / "about as often as not" (not yet) ; the number only in the disclosure | "Rank agreement (Spearman) 0.81" |
| 95% CI, 95% interval, 95% range, interval includes zero | "and we are sure enough of that" / "but that could still be chance" | "95% interval 0.72 to 0.87" |
| trust floor (0.20) | "well enough to act on" | "trust floor 0.20" |
| significant / not significant | **Clear signal** / **Could be chance** (badge words) | "significant after correcting for many inputs" |
| correlation with Titer (axis) | "How strongly it went with Titer" ; chart title "What went with higher Titer" | "Rank correlation" |
| drivers, top process drivers, driver effects | "What went with the result" / "What moves Titer in your runs" (allowed, already used) | "drivers" |
| prediction band, conformal, 90% held-out band, coverage | **Likely range ± 7.05**: "9 of 10 past runs landed this close to their prediction" ; "Measured results inside their likely range: 3 of 5" | "Conformal band at 90% coverage, measured on held-out runs; not guaranteed for new recipes" |
| calibrated, calibration, ECE, z_std, bands read narrow | "The likely range is about the right width" / "too narrow: fewer results land inside it than it promises" / "wider than it needs to be" | "ECE 0.04, z_std 1.3" |
| posterior mean / posterior sd / model spread (SD) | "the model's best guess" / "how sure the model is here" (never a number on the surface) | "Posterior mean, ± 1 posterior SD" |
| median | "typical" / "middle value" ("Typical Titer 48 for Glucose") | "median" |
| sd, standard deviation, spread (sd) | "run-to-run spread" (as a plain number in the target's unit) | "sd" |
| bins, histogram, Sturges | "How many runs at each value" ; "most runs (62%) had Titer between 40 and 50" | "equal-width bins, Sturges' rule" |
| correlation ratio, eta squared | "how strongly the category went with the target" | "correlation ratio (eta²)" |
| n = 213 | "213 runs" | "n = 213" |
| surrogate, GP, acquisition, optimizer | "the model" / "Kalos" / "the search" | "surrogate (GP), acquisition" |
| Explore / Exploit | **Best bet** (the model expects a high value) / **New ground** (tries a recipe the model is unsure about, to learn) | "Explore / Exploit" |
| feasible, feasibility, infeasible | "likely to work" / "unlikely to produce a result" ; "runs unlikely to work were left out" | "feasibility estimate below 50%" |
| applicability domain, extrapolating, outside tried range | "outside what you have tried so far" / "at the edge of what you have tried" | "extrapolation" |
| response surface, slice, incumbent | "Predicted Titer across two inputs" ; "the other inputs are held at your best recipe so far" | "response surface, incumbent" |
| relevance, sensitivity share | "how much the model leans on each input" | "share of fitted sensitivity" |
| interior optimum, monotonic | "best in the middle; more or less is worse" / "more was better across the range tested" | "interior_optimum" |
| promotion gate, surrogate_spearman, group_mean_margin, feasibility_auc, ece, brier | "The model has not passed every check yet" + the why-line + the fix | gate names and values |
| FDR, q-value, Benjamini | "after allowing for testing many inputs at once" | "BH FDR q = 0.1" |
| deterministic function (benchmark) | "a made-up problem with one known answer" | — |
| outliers (check name) | "Unusual values" (already) | "outliers" |
| replicate adequacy / provenance metadata / constant columns (check names) | "Too few repeated runs" / "Missing run details" / "An input that never changes" | engine check names |
| extrapolation, design box, search box | "Kalos searched a narrower range for X" | "design box" |

### Software

| Technical | Plain | Disclosure only |
| --- | --- | --- |
| engine, analysis engine, analysis service | **Kalos** ("Kalos read the sheet", "Kalos proposed 5 recipes", "Kalos left this column out") ; connection: "Could not reach Kalos. This is a connection problem, not a result." ; Settings: "Connection" ; sidebar: "Connected" / "Not connected. Retry" | "Engine 0.9.3, build abc123" |
| sha, SHA-256, hash, fingerprint | nothing on the surface | "Sheet fingerprint (SHA-256)" |
| token, bearer token, credentials | "sign-in" / "access key" (Settings) | "token" |
| payload, request, response, 5xx | "what was sent" / "the answer" ; "Kalos answered with an error" | "HTTP 502" |
| role (column role) | "how each column was used" / "Used as an input" / "Not used" | "role: kept_feature" |
| role (organization) | "access: Admin / Member" ; "Invited as an admin" | "role" |
| schema, schema version | nothing on the surface | "schema v5" |
| provenance | "Where this came from" / "What these runs were built from" | "provenance" |
| seed, fit seed | nothing | "Fit seed 42" |
| metadata | "run details (who, when, which batch of media)" | — |
| re-fit, fit, fitted, cross-validating | "build the model from these columns" / "learning from your runs" / "checking the model on runs it has not seen" | "fit" |
| re-analyze, analysis | "update the model" / "Kalos has read the sheet" ; "the last time Kalos read a sheet" | — |
| folded into the base data | "now part of the runs the model learns from" | — |
| in flight | "in the lab" | — |
| legacy .xls, parser | "older Excel (.xls) files cannot be read in the browser; Kalos still reads them" | — |
| IndexedDB, browser copy | "a copy kept in this browser" | — |
| audit log, jsonl | "Activity record" ("what was done, by whom, when") | "audit-log.jsonl" |
| MFA, TOTP | "a code from your authenticator app" | "TOTP" |

### Buttons (verbs that say what happens next)

| Before | After |
| --- | --- |
| Approve batch | Start these runs (or "Start 5 runs") |
| Review and start round 1 | Review the proposed runs |
| Re-fit with these columns | Build the model with these columns |
| Looks right / Confirmed | Keep these columns / Columns confirmed |
| Save as entered | Save these results |
| Review values | Go back and check |
| Replace and continue | Replace the runs and upload |
| Learn from round 1 | See what round 1 taught the model |
| Plan round 2 | Plan round 2 (keep) |
| View runs in flight | See the runs in the lab |
| Forget | Remove this copy from the browser |
| Retry | Try again |
| Open the agent | Open the assistant |

### Measured vs Predicted

Every number of either kind carries the word next to it: "Best measured so far 63.3", "Predicted 60.9". The legend "○ predicted by the model · ● measured in the lab" stays on every chart that mixes them. "Likely range" is always of a predicted value and is never presented as where the measurement will fall with certainty: "9 of 10 past runs landed this close to their prediction".

## Why-lines by code

One sentence each, prefixed on screen with "Why this matters:". Mirrored verbatim in `lib/why.ts` (`WHY[code]`) and in the engine's `kalos/assist/why.py`.

### Model verdict (reliability state)

- reliable: If the model puts your past runs in the right order, its suggestions are worth lab time; still measure each one, because a prediction is not a result.
- not-yet: If the model cannot yet rank your past runs, its suggestions are closer to guesses, and you would spend runs on them.
- insufficient: With too few measured runs there is no way to tell whether the model is any good, so treat its suggestions as ideas to try, not predictions.

### Model checks (promotion gates)

- surrogate_spearman: If the model cannot rank the runs it was tested on, it cannot tell a good recipe from a poor one, and its suggestions are guesses.
- group_mean_margin: If the model does no better than the average of each group of runs, it has learned the groups, not the recipes, and suggests more of the same.
- feasibility_auc: If the model cannot tell which recipes fail outright, it can suggest runs that produce nothing.
- ece: If the likely range is wrong about how often it is right, you cannot tell a safe bet from a long shot.
- brier: If the model's confidence that a recipe works is unreliable, runs get spent on recipes that fail.
- unmeasured: A check that could not be run on this sheet is a check the model has not passed, so its suggestions have not been tested that way.

### Likely-range check (calibration)

- bands_narrow: If fewer results land inside the likely range than it promises, the range is too narrow and a "safe" recipe can miss by more than shown.
- bands_wide: If far more results land inside the likely range than it promises, the range is wider than it needs to be and good recipes look riskier than they are.
- bands_ok: When the likely range is about right, you can read it as how far a measured result usually lands from its prediction.
- bands_unchecked: Until the likely range has been checked on measured runs, treat its width as a rough guide.

### Proposed-recipe flags (Plan)

- negative: A predicted value below zero for something that cannot be negative means the model is guessing outside what it knows, so this recipe is a long shot.
- low-feasibility: A recipe the model thinks is unlikely to work can still be worth one run to learn from, but do not count on a result.
- constraint: A recipe predicted below the limit you asked for would not meet your own requirement even if the prediction holds.
- outside-range: An input outside what you have tried so far means the model has no runs to go on there, so the prediction is a guess and the run may behave unexpectedly.
- at-edge: An input at the edge of what you have tried means the model has runs on one side only, so the prediction is less sure than it looks.
- gain-within-band: A predicted gain smaller than the likely range may be no gain at all; the run can land below your best.
- fewer_distinct_candidates: Fewer recipes than you asked for means the rest would have repeated these; running near-duplicates would teach you nothing new.
- empty_batch: With no proposed recipes there is nothing to run this round; the sheet gives the model nothing to go on.
- target_constant_upload: If the target never changes, the model cannot learn what raises it and proposes nothing.

### Sheet check (validation findings)

- units_consistency: If one column mixes units, the model treats 37 °C and 98 °F as different settings, and every pattern built on that column is wrong.
- physical_bounds: A value that is physically impossible is usually a typo or a unit mix-up, and the model would learn from it as if it were real.
- duplicate_rows: A run entered twice counts double, so one lucky run can pull the model toward its recipe.
- missingness: Blank cells shrink what the model can learn from, and a column that is mostly blank teaches it almost nothing.
- outliers: A value far from the rest is either a real extreme run or a data-entry mistake; the model cannot tell which, and one mistake can bend its suggestions.
- provenance_metadata: Without who ran it, when, and with which materials, a surprising result cannot be traced back to what led to it.
- replicate_adequacy: Runs that were never repeated hide how much your results vary, so a "best" run may just be a lucky one.
- controls_present: Without a control run there is no baseline, so a change in the result cannot be told apart from ordinary run-to-run variation.
- constant_columns: An input that never changes cannot show any effect, so the model learns nothing from it and cannot suggest changing it.
- informative_missingness: If blanks line up with poor results, filling them in or dropping them would quietly teach the model the answer and make it look better than it is.
- constant_within_group: An input that only changes between groups stands in for the group itself, so a pattern on it may be the group, not the setting.
- mixed_row_types: If simulated or synthetic rows sit among measured ones, the model learns from numbers the lab never saw and can look better than it is.
- no_data_check: Without a sheet check, nothing here has been confirmed, so a mistake in the sheet would pass straight into the model.
- sheet_has_errors: A sheet with errors cannot be trusted as it is: a wrong unit, an impossible value or a doubled run would pass straight into the model and bend its suggestions.
- sheet_usable_with_warnings: The model can learn from this sheet, but each warning is a place where a mistake in the sheet could pass into the model, so read them before you trust its suggestions.
- sheet_passed: A sheet that passes every check gives the model clean runs to learn from, so a surprise later is more likely a real result than a sheet error.

### Sheet facts (Your data flags)

- column_empty: A column with no values adds nothing and may mean a column header was shifted.
- column_missing: Runs with a blank in this column may be left out of the model, so fewer runs teach it.
- column_constant: A column with one value everywhere cannot tell runs apart, so the model ignores it.
- column_headerless: A column with no header cannot be named in the model, so Kalos cannot use it.
- column_unique: A column that is different in every run looks like a run label; used as an input, the model memorises runs instead of learning recipes.
- column_mixed: A number column with text entries is read as text, so its numbers are not used as numbers.
- rows_duplicate: A run that repeats an earlier one exactly counts twice, so one lucky run can pull the model toward its recipe.
- columns_duplicate: Two identical columns are one setting entered twice; the model cannot tell them apart.
- no_repeats: Without any repeated recipe there is no way to see how much the same recipe varies run to run, so a "best" run may just be a lucky one.
- nearly_constant: An input that barely changes across the sheet cannot show a pattern, so no suggestion about it can be trusted.
- left_out_rows: Rows marked simulated or synthetic are kept out of every chart so what you see is only what the lab measured.

### Column use (how each column was read)

- kept_feature: This column is a setting the model can change, so a pattern in it can turn into a suggestion.
- target: This is the number the model is trying to raise; everything else is judged against it.
- dropped_id: A label or ID that changes every run would let the model memorise runs instead of learning recipes, so it was left out.
- dropped_output: A column that looks like a result cannot be set in the lab, so suggesting a value for it would be meaningless.
- dropped_constant: A column with one value cannot show any effect, so the model learns nothing from it.
- dropped_constant_on_fitted_rows: A column that only changes in rows the model could not use cannot show any effect in the rows it learned from.
- dropped_all_blank: A column with no values cannot teach the model anything.
- dropped_non_numeric: A column of mostly text cannot be placed on a scale, so the model cannot learn from it as a setting.
- dropped_sparse: A column that is mostly blank would leave out most runs if it were used, so it was left out instead.
- user_excluded: You chose to leave this column out, so no suggestion changes it.
- former_target: The old target is a result, not a setting, so it is not used as an input.
- unknown_role: Kalos did not use this column; the reason is one click down, as Kalos wrote it.

### Next steps (campaign stages)

- setup_no_sheet: Until you upload a run sheet, Kalos has nothing to learn from and cannot suggest anything.
- setup_done: Kalos has read your runs and built a first model; the first suggestions rest on this sheet alone, so a mistake in it carries through.
- plan_ready: Each proposed recipe costs a run; untick the ones you would not run so the lab time goes where it counts.
- run_waiting: Until these results are entered, the model cannot learn from this round and the next suggestions are no better.
- record_partial: Every result you enter sharpens the next suggestions; a round with missing results teaches the model less.
- learn_ready: Updating the model with this round's results is how the next round gets better suggestions; skipping it means planning on stale information.

### Kalos refusals and errors

- payload_too_large: A sheet over the size limit cannot be read, so nothing from it reaches the model until it is trimmed.
- too_many_fit_rows: The model takes a fixed number of complete runs, and a campaign that outgrows it stops updating until older runs are removed.
- fit_rows_over_cap: The model takes a fixed number of complete runs, and a campaign that outgrows it stops updating until older runs are removed.
- too_many_rows: Over the row limit, the sheet cannot be read at all, so no run in it is used.
- too_many_columns: Over the column limit, the sheet cannot be read at all, so no run in it is used.
- too_many_cells: Over the size limit, the sheet cannot be read at all, so no run in it is used.
- too_few_rows: With too few runs the model cannot tell a pattern from chance, so any suggestion would be a guess.
- too_few_complete_rows: Only runs with a value for the target and every input can teach the model; with too few of them it cannot learn.
- too_few_columns: With no input columns to change, there is nothing for the model to suggest.
- target_empty: A target column with no values gives the model nothing to aim at.
- target_not_found: Without a target column Kalos does not know what to raise.
- target_not_numeric: A target that is not a number cannot be raised or lowered, so the model cannot learn from it.
- target_constant: If the target never changes, the model cannot learn what raises it and proposes nothing.
- no_numeric_inputs: Without a number column to change, the model has nothing to vary and nothing to suggest.
- no_process_inputs: Without a column Kalos can treat as a setting, the model has nothing to vary and nothing to suggest.
- fit_failed: When the model cannot be built, there are no suggestions; the sheet or the target usually needs a change.
- parse_error: A sheet that cannot be read gives the model nothing; the first row should hold the column names and each run one row.
- empty_file: An empty file has no runs to learn from.
- not_a_table: A file that is not a table of runs (one row per run, one column per setting) cannot be read.
- unsupported_file_type: Only CSV, TSV and Excel files can be read; anything else gives the model nothing.
- corrupt_excel: An Excel file that cannot be opened gives the model nothing; re-saving it from Excel usually fixes it.
- ambiguous_header: If Kalos cannot tell which row holds the column names, it cannot tell settings from results.
- sheet_not_found: The worksheet named is not in this file, so nothing was read.
- no_usable_sheet: None of the worksheets holds a table of runs, so nothing was read.
- campaign_has_runs: Replacing the sheet discards the runs recorded in this campaign, and they cannot be recovered here.
- unauthenticated: Until you sign in again, nothing you enter is saved.
- rate_limited: Too many requests in a short time are refused, so wait a minute before trying again.
- engine_busy: Kalos is busy with other work; nothing is lost, and trying again in a moment usually works.
- engine_error: Kalos hit an error, so the result did not come back; your sheet and recorded results are unaffected.
- engine_unreachable: Kalos could not be reached, so this is a connection problem, not a result; nothing you have entered is lost.
- engine_timeout: The work took too long and was stopped; a smaller sheet usually finishes.
- engine_auth_failed: Kalos could not confirm who you are, so nothing was saved; signing in again usually fixes it.
- start_unconfirmed: If the start was not confirmed, some runs may have started and some not, so check Run before starting again.
- record_partial_save: A result that did not save is not in the model; re-enter it so the round is complete.
- generic: Kalos could not use this sheet, so nothing from it reaches the model until the problem is fixed.

### Kalos refusals and errors (more codes)

- interrupted: The work stopped before it finished, so nothing was saved; running it again is safe.
- engine_stopped: Kalos was closed while the work ran, so nothing was saved; running it again is safe.
- read_timeout: The sheet took too long to arrive, so it was not read and nothing from it reaches the model.
- invalid_content_length: The upload arrived incomplete, so it was not read and nothing from it reaches the model.
- analysis_out_of_sync: The model was built before the latest change to the campaign, so its suggestions may not include it.
- model_check: A check the model has not passed means its suggestions have not been tested that way.

### Sheet facts from the upload (how Kalos read the sheet)

- auto_categorical: A text column was read as a set of labels, so Kalos compares each label with the others instead of treating it as a number.
- blank_as_absent: Blank cells in this column were read as "none added"; if a blank meant "not recorded", the model learns from a value the lab never set.
- censored_rows: Runs whose result is only "below detection" have no exact value, so they are left out and teach the model nothing.
- censored_values: A value like "below detection" has no exact number, so it is not used as a number and that run teaches the model less.
- dropped_cells: Cells that could not be read as numbers were left out, so those runs teach the model less than the sheet holds.
- dropped_rows: Runs with blank or unreadable cells were left out, so fewer runs teach the model than the sheet holds.
- header_row: If Kalos picked the wrong row as the column names, every column is misnamed and settings and results get mixed up.
- unnamed_column: A column with no name cannot be traced back to a setting or a result, so Kalos cannot use it.
- near_constant_input: A setting that barely changed was held fixed, because the sheet cannot show its effect and any suggestion about it would be a guess.
- cv_ci_unavailable: With too few groups of runs there is no way to say how sure the check of the model is, so treat its score as rough.
- coverage_not_guaranteed: The likely range was checked on past runs, not on new recipes, so read it as a guide and not a promise about the next run.
- row_number_like: A column that counts rows is not a setting, so it was left out; used as an input, the model memorises runs instead of learning recipes.
- outcome_like: A column measured after the run is a result, not a setting you choose, so suggesting a value for it would be meaningless.
- category_not_modeled: A text column with many different labels has too few runs per label to learn from, so it was left out.

### Review tool findings

- divergence_handling: If repeated wells disagree more than they should, handling was uneven and the difference may not be the recipe.
- divergence_unknown: Without repeated wells and a record of what was done, a difference cannot be pinned on handling or on the recipe.

## Files that may keep technical words (disclosure-only modules)

Mark each with `// plain-words: disclosure-only` in its first five lines. Candidates: `components/campaign/plan/method.tsx`, the provenance table in `components/campaign/plan/approve-dialog.tsx` (better: split it into `provenance.tsx`), `components/campaign/data/model-math.ts` only if every string is rendered inside a disclosure. Everything else is main surface.
