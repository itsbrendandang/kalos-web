"use client";

// "Your data": what the dropped run sheet shows, drawn in the browser before and apart from the fit.
// Every number here comes from the file itself (see profile.ts). Nothing is a model output, and nothing
// here says whether a run or a recipe is good or bad.

import type { ReactNode } from "react";
import { CategoryStripFigure, DistributionFigure, CategoryFigure, CoverageFigure, ReplicateFigure, RunOrderFigure, TargetScatterFigure } from "@/components/campaign/data/figures";
import { dataFlags } from "@/components/campaign/data/flags";
import { histogram, replicateGroups, replicateSpread, summarize, untestedGaps, type ColumnProfile, type SheetProfile } from "@/components/campaign/data/profile";
import { dataNumber } from "@/components/campaign/data/svg";
import { gapSentence } from "@/components/campaign/data/copy";
import { useSheetProfile, type SheetProfileState } from "@/components/campaign/data/use-sheet-profile";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { formatNumber } from "@/lib/format";

/** Reads the held file in the browser and shows what it contains. `sheet` picks a worksheet the engine used. */
export function YourData({ file, sheet, target, engineRuns, engineInputs }: { file: File; sheet?: string; target?: string; engineRuns?: number | null; engineInputs?: string[] }) {
  const state = useSheetProfile(file, sheet);
  return <YourDataView name={file.name} state={state} target={target} engineRuns={engineRuns} engineInputs={engineInputs} />;
}

/**
 * `engineInputs` is the engine's own input list once it has answered. Before that every column that is not the
 * target is shown as a candidate input; afterwards only the engine's inputs are charted, and the rest are named.
 */
export function YourDataView({
  name,
  state,
  target,
  engineRuns,
  engineInputs,
}: {
  name: string;
  state: SheetProfileState | null;
  target?: string;
  engineRuns?: number | null;
  engineInputs?: string[];
}) {
  if (!state || state.status === "loading") {
    return (
      <Section title="Your data" description={`${name}, read in your browser.`}>
        <p className="text-body text-fg-muted">Reading the sheet…</p>
      </Section>
    );
  }
  if (state.status === "unreadable") {
    return (
      <Section title="Your data" description={name}>
        <p className="text-body text-fg-muted">
          {state.reason === "too-large"
            ? "This file is over 5 MB, so it was not read in the browser. The engine still checks it."
            : "This file could not be read in the browser (legacy .xls files are not supported here). The engine still checks it."}
        </p>
      </Section>
    );
  }
  const { profile } = state;
  if (profile.n === 0) {
    return (
      <Section title="Your data" description={name}>
        <p className="text-body text-fg-muted">This sheet has a header and no run rows.</p>
      </Section>
    );
  }
  const flags = dataFlags(profile);
  const isInput = (c: ColumnProfile) => (engineInputs ? engineInputs.includes(c.name) : c.name !== target) && (c.kind === "numeric" || c.kind === "category");
  const inputs = profile.columns.filter(isInput);
  const notUsed = engineInputs ? profile.columns.filter((c) => c.kind !== "empty" && c.name !== target && !engineInputs.includes(c.name)).map((c) => c.name) : [];
  const targetCol = target ? profile.columns.find((c) => c.name === target) : undefined;
  const summary = `${formatNumber(profile.n, "count")} ${profile.n === 1 ? "run" : "runs"}, ${formatNumber(profile.columns.filter((c) => c.kind !== "empty").length, "count")} columns, read from this file in your browser.`;
  return (
    <div className="flex flex-col gap-8">
      <Section title="Your data" description={summary}>
        <div className="flex flex-col gap-6">
          {engineRuns != null && engineRuns !== profile.n ? (
            <p className="text-body text-fg">
              The engine fitted <span className="tabular-nums">{formatNumber(engineRuns, "count")}</span> of these{" "}
              <span className="tabular-nums">{formatNumber(profile.n, "count")}</span> rows. The data check below says why.
            </p>
          ) : null}
          {flags.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {flags.map((f) => (
                <li key={f.key} className="py-2.5 text-body text-fg">
                  {f.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-fg-muted">No blank cells, constant columns, repeated runs or identical columns found.</p>
          )}
          {notUsed.length ? <p className="text-body text-fg-muted">Not used as inputs by the engine: {notUsed.join(", ")}.</p> : null}
          {inputs.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {inputs.map((c) => (
                <li key={c.name} className="py-5 first:pt-0 last:pb-0">
                  <InputRow col={c} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-fg-muted">No numeric or category inputs were found in this sheet.</p>
          )}
        </div>
      </Section>

      <Section title={target ? `Target: ${target}` : "Target"} description={target ? undefined : "The target-against-input and run-order figures appear once the engine has read the sheet and named the target."}>
        {targetCol ? <TargetBlock profile={profile} col={targetCol} inputs={inputs} /> : target ? <p className="text-body text-fg-muted">{target} is not in this sheet.</p> : null}
      </Section>

      <Disclosure summary="How these are made">
        <div className="flex flex-col gap-2 pb-2 text-body text-fg-muted">
          <p>Every figure is drawn from this file in your browser, run by run. Nothing is fitted or sent for these charts.</p>
          <p>Distributions use equal-width bins. Tested range marks each distinct value; a stretch between two neighbouring values is shaded as untested when it is wider than a tenth of the input range.</p>
          <p>Replicates are runs that have the same value in every input column. Row-number-like columns are not used to tell runs apart.</p>
          <p>Run order is the order of the rows in the sheet. It is not proven to be the order the runs were made.</p>
        </div>
      </Disclosure>
    </div>
  );
}

/** One input: its name, a line of plain facts, and its figures (numeric: distribution and tested range; category: bars). */
function InputRow({ col }: { col: ColumnProfile }) {
  if (col.kind === "category") {
    return (
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="min-w-0">
          <p className="font-mono text-code break-words text-fg">{col.name}</p>
          <p className="text-caption text-fg-muted">
            {formatNumber(col.levels.length, "count")} levels: {col.levels.map((l) => `${l.value} (${formatNumber(l.n, "count")})`).join(", ")}
            {col.missing ? `, ${formatNumber(col.missing, "count")} blank` : ""}.
          </p>
        </div>
        <CategoryFigure name={col.name} levels={col.levels} />
      </div>
    );
  }
  const values = col.numbers.filter((v): v is number => v != null);
  const s = summarize(values);
  const hist = histogram(values);
  const gaps = untestedGaps(values);
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="min-w-0">
        <p className="font-mono text-code break-words text-fg">{col.name}</p>
        {s ? (
          <p className="text-caption text-fg-muted">
            From <span className="tabular-nums">{dataNumber(s.min)}</span> to <span className="tabular-nums">{dataNumber(s.max)}</span>, median{" "}
            <span className="tabular-nums">{dataNumber(s.median)}</span>
            {col.missing ? (
              <>
                , <span className="tabular-nums">{formatNumber(col.missing, "count")}</span> blank
              </>
            ) : null}
            .
          </p>
        ) : null}
        <p className="mt-1 text-caption text-fg-muted">{gapSentence(gaps?.gaps ?? [], gaps ? { min: gaps.min, max: gaps.max } : null)}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {hist ? (
          <figure className="flex flex-col gap-1">
            <figcaption className="text-caption text-fg-muted">Runs per range of values</figcaption>
            <DistributionFigure name={col.name} hist={hist} n={values.length} />
          </figure>
        ) : null}
        {gaps ? (
          <figure className="flex flex-col gap-1">
            <figcaption className="text-caption text-fg-muted">Tested range, one tick per run value</figcaption>
            <CoverageFigure name={col.name} min={gaps.min} max={gaps.max} values={values} gaps={gaps.gaps} />
          </figure>
        ) : null}
      </div>
    </div>
  );
}

function TargetBlock({ profile, col, inputs }: { profile: SheetProfile; col: ColumnProfile; inputs: ColumnProfile[] }) {
  if (col.kind !== "numeric") {
    return <p className="text-body text-fg-muted">{col.name} is not numeric in this sheet, so target figures are not drawn.</p>;
  }
  const values = col.numbers.filter((v): v is number => v != null);
  const hist = histogram(values);
  const groups = replicateGroups(profile, new Set(), col.name);
  const spread = replicateSpread(groups);
  return (
    <div className="flex flex-col gap-8">
      <Figure caption={`${col.name} in sheet order`} note="Sheet order is the order the rows were written. It is not proven to be the order the runs were made.">
        <RunOrderFigure yName={col.name} values={col.numbers} groups={groups} />
      </Figure>
      {hist ? (
        <Figure caption={`Distribution of ${col.name}`}>
          <DistributionFigure name={col.name} hist={hist} n={values.length} />
        </Figure>
      ) : null}
      {inputs.length ? (
        <div className="grid gap-8 md:grid-cols-2">
          {inputs.map((x) => (
            <ScatterFor key={x.name} x={x} y={col} />
          ))}
        </div>
      ) : null}
      <Figure caption="Replicate spread" note={replicateSentence(spread)}>
        {groups.length ? <ReplicateFigure yName={col.name} groups={groups} /> : null}
      </Figure>
    </div>
  );
}

function ScatterFor({ x, y }: { x: ColumnProfile; y: ColumnProfile }) {
  const points = y.numbers
    .map((yv, i) => ({ yv, xv: x.kind === "numeric" ? x.numbers[i] : x.raw[i], row: i }))
    .filter((p): p is { yv: number; xv: number | string; row: number } => p.yv != null && p.xv != null && p.xv !== "");
  if (points.length === 0) return null;
  const chart =
    x.kind === "numeric" ? (
      <TargetScatterFigure xName={x.name} yName={y.name} points={points.map((p) => ({ x: p.xv as number, y: p.yv }))} />
    ) : (
      <CategoryStripFigure xName={x.name} yName={y.name} points={points.map((p) => ({ x: String(p.xv), y: p.yv, row: p.row }))} />
    );
  return (
    <Figure caption={`${y.name} against ${x.name}`} note={`${formatNumber(points.length, "count")} runs with both values.`}>
      {chart}
    </Figure>
  );
}

function replicateSentence(spread: { groups: number; runs: number; medianSd: number | null }): string {
  if (spread.groups === 0) return "No replicates: no two runs share every input value, so run-to-run spread cannot be measured from this sheet.";
  return `${formatNumber(spread.groups, "count")} ${spread.groups === 1 ? "recipe" : "recipes"} run more than once (${formatNumber(spread.runs, "count")} runs). Median spread within a recipe: ${dataNumber(spread.medianSd)}.`;
}

function Figure({ caption, note, children }: { caption: string; note?: string; children: ReactNode }) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="text-label text-fg">{caption}</figcaption>
      {children}
      {note ? <p className="text-caption text-fg-muted">{note}</p> : null}
    </figure>
  );
}
