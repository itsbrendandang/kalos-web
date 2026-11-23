"use client";

import { useId, useState, type ReactNode } from "react";
import { Disclosure } from "@/components/kit/disclosure";
import { Metric } from "@/components/kit/metric";
import { Section } from "@/components/kit/section";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CorrelationHeatmap } from "@/components/viz/charts/correlation-heatmap";
import { RunLandscape } from "@/components/viz/charts/run-landscape";
import { NumState } from "@/components/viz/num";
import type { AnalyzeResult } from "@/lib/api";
import { formatSetting, formatValue, parseUnit, settingDecimals } from "@/lib/num";
import type { RolesContext } from "@/lib/sheet-roles";
import { sourceFromAnalysis } from "@/lib/source";
import { toCorrelationProps } from "@/lib/viz-data/correlation-heatmap";
import { toLandscapeProps } from "@/lib/viz-data/run-landscape";
import {
  boxRangeText,
  cellsByColumn,
  columnRows,
  designRows,
  exclusionFacts,
  headerRow,
  narrowedBoxNote,
  orientationOf,
  orientationText,
  visualizationAbsentText,
  visualizationReasons,
  type ColumnRow,
  type HarmonizeAnalysis,
} from "@/components/harmonize/data-facts";

/** A count as the engine reported it ("1,204"), or the n/a state when it reported nothing (never 0). */
function Count({ value }: { value: number | null | undefined }) {
  return value == null || !Number.isFinite(value) ? <NumState state={{ kind: "na" }} /> : <>{formatValue(value, { quantity: "count" }).text}</>;
}

/** Plain-text count for prose and attribute strings; "n/a" when the engine sent nothing. */
const countText = (v: number | null | undefined) => formatValue(v, { quantity: "count" }).text;

const STATUS_TEXT: Record<ColumnRow["status"], string> = {
  target: "text-fg",
  kept: "text-fg",
  coerced: "text-warn",
  dropped: "text-fg-muted",
};

/**
 * "Your data": what the engine read from the sheet, column by column, what it left out and why,
 * and how it read the file. Built only from analysis fields (provenance, data_drops, run record).
 */
export function YourData({ analysis, roles, quality }: { analysis: HarmonizeAnalysis; roles: RolesContext; quality?: ReactNode }) {
  const rows = columnRows(analysis, roles);
  const [query, setQuery] = useState("");
  const inputId = useId();
  const visible = rows.filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Section
      id="your-data"
      title="Research data"
      description="Inspect the study source, then its schema and quality. These are the current analysis fields, not the campaign's result log. Anything the engine did not report reads n/a."
    >
      <div className="grid gap-5 rounded-xl bg-subtle p-5 sm:grid-cols-3">
        <Metric label="Rows read" value={analysis.run?.n_rows} quantity="count" qualifier="From input metadata" />
        <Metric label="Inputs used" value={analysis.run?.n_features ?? analysis.features?.length} quantity="count" qualifier="Current fit, not all sheet columns" />
        <Metric label="Columns with a role trail" value={analysis.provenance ? rows.length : null} quantity="count" qualifier="From engine provenance" />
      </div>
      <Tabs defaultValue="source">
        <TabsList className="h-auto min-h-9 max-w-full flex-wrap gap-y-2" aria-label="Research data views"><TabsTrigger value="source" className="py-1">Study & source</TabsTrigger><TabsTrigger value="columns" className="py-1">Columns & roles</TabsTrigger><TabsTrigger value="quality" className="py-1">Quality & exclusions</TabsTrigger></TabsList>
        <TabsContent value="source" keepMounted className="pt-3"><SheetReading analysis={analysis} /></TabsContent>
        <TabsContent value="columns" keepMounted className="space-y-4 pt-3">
          <div className="max-w-sm"><label htmlFor={inputId} className="mb-1 block text-caption text-fg-muted">Find a column</label><Input id={inputId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a column name" /></div>
          {rows.length ? <p className="text-caption text-fg-muted" role="status">{visible.length} of {rows.length} columns shown.</p> : null}
          {rows.length && !visible.length ? <p className="text-body text-fg-muted">No columns match this search.</p> : <ColumnTable rows={visible} />}
        </TabsContent>
        <TabsContent value="quality" keepMounted className="space-y-8 pt-3">{quality}<Excluded analysis={analysis} /></TabsContent>
      </Tabs>
    </Section>
  );
}

function ColumnTable({ rows }: { rows: ColumnRow[] }) {
  if (rows.length === 0) {
    return <p className="text-body text-fg-muted">This analysis did not include the column trail, so the columns cannot be listed. Re-upload the sheet to get it.</p>;
  }
  const declared = rows.some((r) => r.source === "declared");
  return (
    <Table containerClassName="max-h-[640px] rounded-xl border border-border">
      <TableCaption className="px-3 pb-3 text-left">
        Non-numeric cells are cells the engine could not read as numbers. They are expected for IDs and categorical inputs; for a numeric input
        they are left out of the fit. {declared ? "Roles marked declared are the ones you chose for this upload." : "Roles were inferred from the column names."}
      </TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="bg-surface">Column</TableHead>
          <TableHead className="bg-surface">Status</TableHead>
          <TableHead numeric className="bg-surface">
            Filled cells
          </TableHead>
          <TableHead numeric className="bg-surface">
            Non-numeric cells
          </TableHead>
          <TableHead className="bg-surface">Role set by</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name}>
            <TableCell className="font-mono text-code text-fg">{r.name}</TableCell>
            <TableCell className={STATUS_TEXT[r.status]} title={`Engine status: ${r.raw}`}>
              {r.label}
              {r.warning ? <span className="ml-2 text-caption text-warn">({r.warning})</span> : null}
            </TableCell>
            <TableCell numeric>
              <Count value={r.nonNull} />
            </TableCell>
            <TableCell numeric>
              <Count value={r.coerced} />
            </TableCell>
            <TableCell className="text-fg-muted">{r.source === "declared" ? "You (declared)" : r.source === "inferred" ? "Kalos (inferred)" : "n/a"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Excluded({ analysis }: { analysis: HarmonizeAnalysis }) {
  const facts = exclusionFacts(analysis);
  const perColumn = cellsByColumn(analysis);
  const auto = analysis.auto_categorical;
  const cats = analysis.categorical_features;
  return (
    <div className="min-w-0">
      <h3 className="text-label text-fg">What was left out</h3>
      <dl className="mt-2 flex flex-col">
        {facts.map((f) => (
          <div key={f.label} className="flex items-baseline justify-between gap-4 border-b border-border py-2">
            <dt className="text-body text-fg-muted">
              {f.label}
              {f.note ? <span className="text-caption"> ({f.note})</span> : null}
            </dt>
            <dd className="text-body tabular-nums text-fg">
              <Count value={f.value} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-caption text-fg-muted">
        {cats === undefined
          ? "This analysis did not report which inputs were modeled as categories."
          : cats.length === 0
            ? "No input was modeled as categorical."
            : `Modeled as categorical: ${cats.join(", ")}${auto && auto.length > 0 ? ` (${auto.join(", ")} detected from repeated text values, not declared)` : ""}.`}
      </p>
      {perColumn.length > 0 ? (
        <Disclosure summary="Unusable cells by column" meta={`${perColumn.length}`} className="mt-3">
          <ul className="flex flex-col gap-1 text-body text-fg-muted">
            {perColumn.map((c) => (
              <li key={`${c.column}-${c.reason}`}>
                <span className="font-mono text-code text-fg">{c.column}</span>: {countText(c.n)} {c.reason}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}

function SheetReading({ analysis }: { analysis: HarmonizeAnalysis }) {
  const run = analysis.run;
  const header = headerRow(analysis);
  const orientation = orientationOf(analysis);
  const items: { label: string; value: string }[] = [
    { label: "File", value: run?.filename ?? (run?.anonymize ? "Not recorded (anonymized)" : "n/a") },
    { label: "Worksheet", value: run?.sheet ?? (run ? "Only sheet, or a CSV" : "n/a") },
    { label: "Modeled response", value: analysis.target },
    { label: "Input SHA-256", value: run?.input_sha256 ?? "Not reported" },
    { label: "Column names", value: header != null ? `Row ${countText(header + 1)} of the sheet` : "n/a" },
    { label: "Layout", value: orientation ? orientationText(orientation) : "n/a" },
    { label: "Rows read", value: countText(run?.n_rows) },
    { label: "Inputs used", value: countText(run?.n_features ?? analysis.features?.length) },
    { label: "Column profile", value: run?.profile === "bioprocess" ? "Bioprocess (name-based checks and units)" : run?.profile === "generic" ? "Generic" : (run?.profile ?? "n/a") },
  ];
  return (
    <div className="min-w-0">
      <h3 className="text-label text-fg">How the sheet was read</h3>
      <dl className="mt-2 flex flex-col">
        {items.map((i) => (
          <div key={i.label} className="flex items-baseline justify-between gap-4 border-b border-border py-2">
            <dt className="shrink-0 text-body text-fg-muted">{i.label}</dt>
            <dd className="min-w-0 text-right text-body break-words text-fg">{i.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The search box: each input's observed low and high, as the engine reports them. Labelled as the box
 * the optimizer searches, never as an operating range; campaign-setup bounds narrow it (shown in the
 * setup section), never widen it. Low and high share
 * the precision the input's range supports (VIZ_SPEC 2.4), the same precision Predict shows setpoints at.
 */
export function DesignSpace({ analysis }: { analysis: HarmonizeAnalysis }) {
  const rows = designRows(analysis);
  const exclusions = analysis.design_box_exclusions;
  const narrowedNote = narrowedBoxNote(exclusions);
  return (
    <Section
      id="design-space"
      title="Explored design space"
      description="The lowest and highest value of each input in your data. This is the search box: Kalos proposes recipes inside it. It is not an operating range. Bounds in the campaign setup can narrow it, never widen it."
    >
      {rows.length === 0 ? (
        <p className="text-body text-fg-muted">This analysis lists no inputs.</p>
      ) : (
        <Table containerClassName="rounded-xl border border-border">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-surface">Input</TableHead>
              <TableHead numeric className="bg-surface">
                Observed low
              </TableHead>
              <TableHead numeric className="bg-surface">
                Observed high
              </TableHead>
              <TableHead className="bg-surface">Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const range: [number, number] | null = r.low != null && r.high != null ? [r.low, r.high] : null;
              const decimals = settingDecimals(range) ?? undefined;
              const bound = (v: number | null) =>
                r.kind === "continuous" && v != null ? (
                  formatSetting(v, range, null, decimals).text
                ) : (
                  <NumState state={{ kind: "na" }} />
                );
              return (
                <TableRow key={r.name}>
                  <TableCell className="font-mono text-code text-fg">{r.name}</TableCell>
                  <TableCell numeric title={r.low != null ? `Engine value: ${r.low}` : undefined}>
                    {bound(r.low)}
                  </TableCell>
                  <TableCell numeric title={r.high != null ? `Engine value: ${r.high}` : undefined}>
                    {bound(r.high)}
                  </TableCell>
                  <TableCell className="whitespace-normal text-caption text-fg-muted">
                    {r.narrowed
                      ? `Narrowed to ${boxRangeText(r.narrowed.lower, r.narrowed.upper)}: ${countText(r.narrowed.n_excluded)} physically impossible ${r.narrowed.n_excluded === 1 ? "value" : "values"} left out of the box`
                      : r.kind === "categorical"
                        ? "Categorical: searched over the levels in your data (levels not listed by the engine)"
                        : r.kind === "unreported"
                          ? "Range not reported by the engine"
                          : ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <p className="text-caption text-fg-muted">
        {exclusions === undefined
          ? "This analysis did not report whether any range was narrowed for physically impossible values."
          : narrowedNote
            ? narrowedNote
            : "No range was narrowed: every observed value is inside the box."}{" "}
        To search beyond a range, add runs that go beyond it and upload the sheet again.
      </p>
    </Section>
  );
}

type PicturesAnalysis = HarmonizeAnalysis &
  Pick<AnalyzeResult, "n" | "engine_version" | "seed" | "timestamp"> & { target: string; dataset?: string; updated?: number };

/** Correlation map and run map, each one click down; when absent, the engine's reason in plain words. */
export function DataPictures({ analysis }: { analysis: PicturesAnalysis }) {
  const reasons = visualizationReasons(analysis);
  const unit = parseUnit(analysis.target).unit;
  const correlation = toCorrelationProps(analysis.correlation, analysis.target, analysis.n);
  const landscape = toLandscapeProps(analysis.embedding, analysis.target, unit);
  return (
    <div className="flex flex-col">
      <Disclosure summary="How the inputs and the target move together" meta="Spearman ρ">
        {correlation ? (
          <CorrelationHeatmap data={correlation} source={sourceFromAnalysis(analysis, "correlation", "derived", "Spearman rank correlation, pairwise")} />
        ) : (
          <Absent text={visualizationAbsentText("correlation", reasons?.correlation ?? null)} raw={reasons?.correlation ?? null} />
        )}
      </Disclosure>
      <Disclosure summary="Your runs by recipe similarity" meta="Run map" className="border-b">
        {landscape && landscape.points.length > 0 ? (
          <RunLandscape data={landscape} source={sourceFromAnalysis(analysis, "embedding", "measured", "PCA of the standardized inputs")} />
        ) : (
          <Absent text={visualizationAbsentText("embedding", reasons?.embedding ?? null)} raw={reasons?.embedding ?? null} />
        )}
      </Disclosure>
    </div>
  );
}

function Absent({ text, raw }: { text: string; raw: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body text-fg-muted">{text}</p>
      {raw ? <p className="text-caption text-fg-muted">Engine note: {raw}</p> : null}
    </div>
  );
}
