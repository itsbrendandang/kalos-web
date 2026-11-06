"use client";

import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import { ModeBadge } from "@/components/ui/badge";
import { Section } from "@/components/kit/section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { insideRange, roundChanges, type LearnedRun, type RoundRecord } from "@/lib/learn-record";

/**
 * The first thing on Learn (first-time study, F5): the recorded runs of the round, measured, each with
 * its recipe (the same label and columns as Plan, Run and Record), its prediction, its result and whether
 * the result landed inside the likely range; then what changed since the previous round. Says plainly
 * whether the model has learned from these results yet, and where each number comes from.
 */
export function RoundResults({
  round,
  target,
  unit,
  band,
  columns,
  unlearned,
  record,
  awaiting,
  nextRound,
  history,
  engineRound,
}: {
  round: number;
  target: string;
  unit: string;
  band: number | null;
  columns: readonly string[];
  /** Results recorded but not yet learned from (still listed by Kalos), or null once they were folded in. */
  unlearned: LearnedRun[] | null;
  /** The browser's record of the round the model last learned from, when it has one. */
  record: RoundRecord | null;
  awaiting: number;
  nextRound: number;
  history: readonly { round: number; best: number | null; n_base: number }[];
  engineRound: number;
}) {
  const runs = unlearned ?? record?.runs ?? [];
  const cols = unlearned ? columns : (record?.columns ?? columns);
  const usedBand = unlearned ? band : (record?.before.band ?? band);
  const inside = runs.map((r) => insideRange(r, usedBand));
  const counted = inside.filter((x): x is boolean => x != null);
  const changes = roundChanges({ history, engineRound, target, unit, record: unlearned ? null : record });
  const fromBrowser = changes.some((ch) => ch.source === "browser");

  return (
    <div className="flex flex-col gap-8">
      <Section
        title={`What round ${formatNumber(round, "count")} measured`}
        description={
          runs.length === 0
            ? awaiting > 0
              ? `No result has been recorded for round ${formatNumber(round, "count")} yet; ${formatNumber(awaiting, "count")} ${awaiting === 1 ? "run is" : "runs are"} still waiting for one.`
              : "Kalos does not list a round's runs once it has learned from them, and this browser has no record of this round's results."
            : unlearned
              ? `${formatNumber(runs.length, "count")} ${runs.length === 1 ? "result" : "results"} recorded. The model has not learned from ${runs.length === 1 ? "it" : "them"} yet: "Update the model and plan round ${formatNumber(nextRound, "count")}" does that.`
              : `${formatNumber(runs.length, "count")} ${runs.length === 1 ? "result" : "results"} the model learned from when you planned round ${formatNumber(nextRound, "count")}. Kept in this browser; Kalos does not list a round's runs once it has learned from them.`
        }
      >
        {runs.length ? (
          <div className="flex flex-col gap-2">
            <div data-scroll-x className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Recipe</TableHead>
                    {cols.map((c) => (
                      <TableHead key={c} numeric className="font-mono text-code whitespace-nowrap">
                        {c}
                      </TableHead>
                    ))}
                    <TableHead numeric>Predicted {target}</TableHead>
                    <TableHead numeric>Measured {target}</TableHead>
                    <TableHead numeric>Measured minus predicted</TableHead>
                    <TableHead>Inside the likely range?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <span className="font-mono text-code text-fg">{r.label}</span>
                          <ModeBadge mode={r.mode} />
                        </span>
                      </TableCell>
                      {cols.map((c) => (
                        <TableCell key={c} numeric className="tabular-nums whitespace-nowrap">
                          {c in r.recipe ? formatNumber(r.recipe[c]) : <span className="text-fg-muted">n/a</span>}
                        </TableCell>
                      ))}
                      <TableCell numeric className="tabular-nums">
                        {formatNumber(r.pred)}
                      </TableCell>
                      <TableCell numeric className="font-medium tabular-nums text-fg">
                        {formatNumber(r.result)}
                      </TableCell>
                      <TableCell numeric className="tabular-nums">
                        {formatNumber(r.result - r.pred, "value", { sign: true })}
                      </TableCell>
                      <TableCell>
                        {inside[i] == null ? (
                          <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
                            <CircleDashed className="size-3.5" aria-hidden /> no range reported
                          </span>
                        ) : inside[i] ? (
                          <span className="inline-flex items-center gap-1 text-caption text-good">
                            <CircleCheck className="size-3.5" aria-hidden /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-caption text-warn">
                            <TriangleAlert className="size-3.5" aria-hidden /> No
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-caption text-fg-muted">
              {usedBand != null
                ? `${formatNumber(counted.filter(Boolean).length, "count")} of ${formatNumber(counted.length, "count")} landed inside the likely range of ± ${formatNumber(usedBand)}${unit ? ` ${unit}` : ""} around their prediction. `
                : ""}
              Measured values are what you recorded; predicted values are what the model said before the run.
            </p>
          </div>
        ) : null}
      </Section>

      <Section
        title={history.length > 1 ? `What changed since round ${formatNumber(Math.max(0, round - 1), "count")}` : "What changed"}
        description={
          unlearned
            ? "Nothing yet: the model has not learned from this round's results. Once it has, this says what moved."
            : changes.length
              ? fromBrowser
                ? "The run and best counts are Kalos's own; the score, range and input lines compare the model before and after the update, from a copy kept in this browser. Kalos does not yet report what an update changed."
                : "From the campaign's own rounds. Kalos does not yet report what an update changed."
              : "The model has not been updated since the upload, so there is no earlier round to compare with."
        }
      >
        {!unlearned && changes.length ? (
          <ul className="flex flex-col gap-1.5">
            {changes.map((ch) => (
              <li key={ch.text} className="text-body text-fg">
                {ch.text}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    </div>
  );
}
