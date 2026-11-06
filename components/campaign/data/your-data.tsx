"use client";

// "Your data": what the dropped run sheet shows, drawn in the browser before and apart from the fit.
// Every number here comes from the file itself (see profile.ts). Nothing is a model output, and every sentence
// under a figure states an association in these runs (meaning.ts), never a cause.

import { pairedValues, rankInputs, strengthWord, type InputRank } from "@/components/campaign/data/association";
import { CategoryStripFigure, DistributionFigure, CategoryFigure, CoverageFigure, Figure, ReplicateFigure, RunOrderFigure, TargetScatterFigure } from "@/components/campaign/data/figures";
import { dataFlags } from "@/components/campaign/data/flags";
import * as meaning from "@/components/campaign/data/meaning";
import { dataTypeColumn, histogram, isRowNumberLike, measuredOnly, replicateGroups, replicateSpread, summarize, untestedGaps, type ColumnProfile, type SheetProfile } from "@/components/campaign/data/profile";
import { dataNumber } from "@/components/campaign/data/svg";
import { gapSentence } from "@/components/campaign/data/copy";
import { useSheetProfile, type SheetProfileState } from "@/components/campaign/data/use-sheet-profile";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { formatNumber } from "@/lib/format";

/** Inputs whose association with the target is at least this strong are shown full size; the rest go in a disclosure. */
export const TOP_STRENGTH = 0.3;
/** How many inputs at most are shown full size. */
export const TOP_MAX = 4;

/** Reads the held file in the browser and shows what it contains. `sheet` picks a worksheet the engine used. */
export function YourData({ file, sheet, target, engineRuns, engineInputs }: { file: File; sheet?: string; target?: string; engineRuns?: number | null; engineInputs?: string[] }) {
  const state = useSheetProfile(file, sheet);
  return <YourDataView name={file.name} state={state} target={target} engineRuns={engineRuns} engineInputs={engineInputs} />;
}

/** The inputs in the order of their association with the target: the `rankInputs` order, or sheet order without a target. */
export function orderInputs(profile: SheetProfile, inputs: ColumnProfile[], target?: string): { col: ColumnProfile; rank: InputRank | null }[] {
  const targetCol = target ? profile.columns.find((c) => c.name === target) : undefined;
  if (!target || !targetCol || targetCol.kind !== "numeric") return inputs.map((col) => ({ col, rank: null }));
  const ranks = rankInputs(profile, target, inputs);
  return ranks.map((rank) => ({ col: inputs.find((c) => c.name === rank.name)!, rank }));
}

/** Which ranked inputs are shown full size: strength at least `TOP_STRENGTH`, at least one, at most `TOP_MAX`. */
export function splitTop<T extends { rank: InputRank | null }>(ordered: T[]): { top: T[]; rest: T[] } {
  const eligible = ordered.filter((o) => !o.rank?.nearlyConstant);
  const strong = eligible.filter((o) => (o.rank?.strength ?? 0) >= TOP_STRENGTH).slice(0, TOP_MAX);
  const top = strong.length ? strong : eligible.slice(0, 1);
  return { top, rest: ordered.filter((o) => !top.includes(o)) };
}

/**
 * `engineInputs` is the engine's own input list once it has answered. Before that every column that is not the
 * target is shown as a candidate input; afterwards only the engine's inputs are charted, and the rest are named.
 * `rowOrigins` gives one label per row ("Round 1"; null for the sheet itself) so the sheet-order figure can show
 * each origin in its own panel. `hideFacts` leaves out the flag list when a page shows it elsewhere.
 */
export function YourDataView({
  name,
  state,
  target,
  engineRuns,
  engineInputs,
  rowOrigins,
  hideFacts,
  title = "Your data",
  targetFirst = false,
}: {
  name: string;
  state: SheetProfileState | null;
  target?: string;
  engineRuns?: number | null;
  engineInputs?: string[];
  rowOrigins?: (string | null)[];
  hideFacts?: boolean;
  /** The heading of the inputs block ("Your data" on Setup; a sheet's own page says "Inputs"). */
  title?: string;
  /** Draw the target block above the inputs (a sheet's own page leads with the target). */
  targetFirst?: boolean;
}) {
  if (!state || state.status === "loading") {
    return (
      <Section title={title} description={`${name}, read in your browser.`}>
        <p className="text-body text-fg-muted">Reading the sheet…</p>
      </Section>
    );
  }
  if (state.status === "unreadable") {
    return (
      <Section title={title} description={name}>
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
      <Section title={title} description={name}>
        <p className="text-body text-fg-muted">This sheet has a header and no run rows.</p>
      </Section>
    );
  }
  const flags = hideFacts ? [] : dataFlags(profile);
  // Shared rule 6: rows a data_type column marks as not measured are never charted.
  const split = measuredOnly(profile);
  const charted = split?.profile ?? profile;
  const origins = split && rowOrigins ? rowOrigins.filter((_, i) => split.kept[i]) : rowOrigins;
  const dataType = dataTypeColumn(profile)?.name;
  const isInput = (c: ColumnProfile) => (engineInputs ? engineInputs.includes(c.name) : c.name !== target) && c.name !== dataType && (c.kind === "numeric" || c.kind === "category");
  const inputs = charted.columns.filter(isInput);
  const notUsed = engineInputs ? profile.columns.filter((c) => c.kind !== "empty" && c.name !== target && !engineInputs.includes(c.name)).map((c) => c.name) : [];
  const targetCol = target ? charted.columns.find((c) => c.name === target) : undefined;
  const ordered = orderInputs(charted, inputs, target);
  // Columns the engine left out are still data: they are charted against the target one click down, never full
  // size and never in the lead sentence. Row-number-like columns and the origin column stay out.
  const leftOut = engineInputs
    ? orderInputs(
        charted,
        charted.columns.filter((c) => !engineInputs.includes(c.name) && c.name !== target && c.name !== dataType && (c.kind === "numeric" || c.kind === "category") && !isRowNumberLike(c, charted.n)),
        target,
      )
    : [];
  const summary = `${formatNumber(profile.n, "count")} ${profile.n === 1 ? "run" : "runs"}, ${formatNumber(profile.columns.filter((c) => c.kind !== "empty").length, "count")} columns, read from this file in your browser.`;
  const inputsBlock = (
    <Section title={title} description={summary}>
        <div className="flex flex-col gap-6">
          {engineRuns != null && engineRuns !== profile.n ? (
            <p className="text-body text-fg">
              The engine fitted <span className="tabular-nums">{formatNumber(engineRuns, "count")}</span> of these{" "}
              <span className="tabular-nums">{formatNumber(profile.n, "count")}</span> rows. The data check below says why.
            </p>
          ) : null}
          {hideFacts ? null : flags.length ? (
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
          {split ? <p className="text-body text-fg">{meaning.leftOut(split, profile.n)}</p> : null}
          {ordered.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {ordered.map(({ col, rank }, i) => (
                <li key={col.name} className="py-5 first:pt-0 last:pb-0">
                  <InputRow col={col} caption={rank ? strengthWord(rank, i) : undefined} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-fg-muted">No numeric or category inputs were found in this sheet.</p>
          )}
        </div>
    </Section>
  );
  const targetBlock = (
    <Section title={target ? `Target: ${target}` : "Target"} description={target ? undefined : "The target-against-input and run-order figures appear once the engine has read the sheet and named the target."}>
      {targetCol ? <TargetBlock profile={charted} col={targetCol} ordered={ordered} leftOut={leftOut} origins={origins} usedInputs={engineInputs} /> : target ? <p className="text-body text-fg-muted">{target} is not in this sheet.</p> : null}
    </Section>
  );
  return (
    <div className="flex flex-col gap-8">
      {targetFirst ? targetBlock : inputsBlock}
      {targetFirst ? inputsBlock : targetBlock}

      <Disclosure summary="How these are made">
        <div className="flex flex-col gap-2 pb-2 text-body text-fg-muted">
          <p>Every figure is drawn from this file in your browser, run by run. Nothing is fitted or sent for these charts. Dots are runs; the ring marks the best run.</p>
          <p>
            Distributions use equal-width bins on round edges, the bin count from Sturges&apos; rule (log2 of the run count, plus one, between 4 and 15). Tested range marks each distinct value; a stretch between two
            neighbouring values is shaded as untested when it is wider than a tenth of the input range.
          </p>
          <p>
            Inputs are ordered by how strongly they moved with the target in these runs: Spearman&apos;s rank correlation for numbers, the correlation ratio for categories. An input whose range is under 1% of its
            median, or that takes at most two values, is nearly constant and cannot show an association. These are associations in this sheet, not causes.
          </p>
          <p>Replicates are runs that have the same value in every input the engine uses (every numeric or category column until the engine has named its inputs). Rows that agree on the used inputs and differ only in a column the engine did not use are still replicates, and the sentence names that column. Row-number-like columns are not used to tell runs apart.</p>
          <p>Run order is the order of the rows in the sheet. It is not proven to be the order the runs were made.</p>
          {split ? <p>Rows whose {split.column} is not real or measured stay out of every chart, so measured runs are never mixed with simulated or synthetic ones.</p> : null}
        </div>
      </Disclosure>
    </div>
  );
}

/** One input: its name and place in the ranking, a line of plain facts, and its figures (numeric: distribution and tested range; category: bars). */
function InputRow({ col, caption }: { col: ColumnProfile; caption?: string }) {
  const title = (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-mono text-code break-words text-fg">{col.name}</span>
      {caption ? <span className="text-caption text-fg-muted">{caption}</span> : null}
    </p>
  );
  if (col.kind === "category") {
    return (
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="min-w-0">
          {title}
          <p className="text-caption text-fg-muted">
            {formatNumber(col.levels.length, "count")} levels: {col.levels.map((l) => `${l.value} (${formatNumber(l.n, "count")})`).join(", ")}
            {col.missing ? `, ${formatNumber(col.missing, "count")} blank` : ""}.
          </p>
        </div>
        <figure className="flex min-w-0 flex-col gap-1">
          <figcaption className="text-caption text-fg-muted">Runs per level, n = {formatNumber(col.filled, "count")}</figcaption>
          <CategoryFigure name={col.name} levels={col.levels} />
        </figure>
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
        {title}
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
        {hist && s ? (
          <figure className="flex flex-col gap-1">
            <figcaption className="text-caption text-fg-muted">Runs per range of values, n = {formatNumber(values.length, "count")}</figcaption>
            <DistributionFigure name={col.name} hist={hist} n={values.length} />
            <p className="text-caption text-fg">{meaning.histogram(hist, values.length, s.max)}</p>
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

function TargetBlock({
  profile,
  col,
  ordered,
  leftOut = [],
  origins,
  usedInputs,
}: {
  profile: SheetProfile;
  col: ColumnProfile;
  ordered: { col: ColumnProfile; rank: InputRank | null }[];
  /** Columns the engine did not use, charted one click down and captioned as such. */
  leftOut?: { col: ColumnProfile; rank: InputRank | null }[];
  origins?: (string | null)[];
  /** The engine's input list: replicates are judged on these columns only, as the engine sees them. */
  usedInputs?: readonly string[];
}) {
  if (col.kind !== "numeric") {
    return <p className="text-body text-fg-muted">{col.name} is not numeric in this sheet, so target figures are not drawn.</p>;
  }
  const values = col.numbers.filter((v): v is number => v != null);
  const s = summarize(values);
  const hist = histogram(values);
  const groups = replicateGroups(profile, new Set(), col.name, usedInputs);
  const spread = replicateSpread(groups);
  const { top, rest } = splitTop(ordered);
  const constant = rest.filter((o) => o.rank?.nearlyConstant);
  const weaker = rest.filter((o) => !o.rank?.nearlyConstant);
  return (
    <div className="flex flex-col gap-8">
      <Figure caption={`${col.name} in sheet order, n = ${formatNumber(values.length, "count")}`} sentence={meaning.sheetOrder(col.numbers, groups, origins)} note="Sheet order is the order the rows were written. It is not proven to be the order the runs were made.">
        <RunOrderFigure yName={col.name} values={col.numbers} groups={groups} origins={origins} />
      </Figure>
      {hist && s ? (
        <Figure caption={`Distribution of ${col.name}, n = ${formatNumber(values.length, "count")}`} sentence={meaning.histogram(hist, values.length, s.max)}>
          <DistributionFigure name={col.name} hist={hist} n={values.length} />
        </Figure>
      ) : null}
      {top.length ? (
        <div className="grid gap-8 md:grid-cols-2">
          {top.map((o) => (
            <ScatterFor key={o.col.name} x={o.col} y={col} />
          ))}
        </div>
      ) : null}
      {rest.length || leftOut.length ? (
        <Disclosure summary={foldedSummary(rest.length, leftOut.length)}>
          <div className="flex flex-col gap-8 pt-2">
            {weaker.length ? (
              <div className="grid gap-8 md:grid-cols-2">
                {weaker.map((o) => (
                  <ScatterFor key={o.col.name} x={o.col} y={col} />
                ))}
              </div>
            ) : null}
            {leftOut.length ? (
              <div className="grid gap-8 md:grid-cols-2">
                {leftOut.map((o) => (
                  <ScatterFor key={o.col.name} x={o.col} y={col} caption="not used by the engine" />
                ))}
              </div>
            ) : null}
            {constant.length ? (
              <ul className="flex flex-col gap-2">
                {constant.map((o) => {
                  const cs = summarize(o.col.numbers.filter((v): v is number => v != null));
                  return (
                    <li key={o.col.name} className="text-body text-fg">
                      <span className="font-mono text-code">{o.col.name}</span>: {cs ? meaning.nearlyConstant(o.col.name, col.name, cs.min, cs.max) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </Disclosure>
      ) : null}
      <Figure caption={`Replicate spread${groups.length ? `, ${formatNumber(groups.length, "count")} ${groups.length === 1 ? "recipe" : "recipes"}` : ""}`} sentence={meaning.replicate(spread, s?.sd ?? null, groups)}>
        {groups.length ? <ReplicateFigure yName={col.name} groups={groups} /> : null}
      </Figure>
    </div>
  );
}

/** The disclosure's summary: weaker inputs, columns the engine left out, or both. */
export function foldedSummary(weaker: number, leftOut: number): string {
  const a = weaker ? `${formatNumber(weaker, "count")} more ${weaker === 1 ? "input" : "inputs"} with weaker association` : "";
  const b = leftOut ? `${formatNumber(leftOut, "count")} ${leftOut === 1 ? "column" : "columns"} the engine did not use` : "";
  return a && b ? `${a}, and ${b}` : a || b;
}

function ScatterFor({ x, y, caption }: { x: ColumnProfile; y: ColumnProfile; caption?: string }) {
  const { xs, ys, rows } = pairedValues(x, y);
  if (ys.length === 0) return null;
  const chart =
    x.kind === "numeric" ? (
      <TargetScatterFigure xName={x.name} yName={y.name} points={(xs as number[]).map((xv, i) => ({ x: xv, y: ys[i] }))} />
    ) : (
      <CategoryStripFigure xName={x.name} yName={y.name} points={(xs as string[]).map((xv, i) => ({ x: xv, y: ys[i], row: rows[i] }))} />
    );
  // A strip figure with many levels is wider than one column, so it takes the whole row instead of scrolling.
  return (
    <Figure caption={`${y.name} against ${x.name}${caption ? `, ${caption}` : ""}`} sentence={meaning.inputSentence(x, y)} className={x.kind === "category" && x.levels.length > 4 ? "md:col-span-2" : undefined}>
      {chart}
    </Figure>
  );
}
