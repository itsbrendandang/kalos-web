"use client";

import { Disclosure } from "@/components/kit/disclosure";
import { lazyChart } from "@/components/kit/lazy-chart";
import { Section } from "@/components/kit/section";
import { CorrelationHeatmap } from "@/components/campaign/correlation-heatmap";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { designBoxExclusionsNote } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { RolesContext } from "@/lib/sheet-roles";
import { parseUnit } from "@/lib/utils";
import {
  cellsByColumn,
  correlationLabels,
  columnRows,
  designRows,
  exclusionFacts,
  headerRow,
  orientationOf,
  orientationText,
  visualizationAbsentText,
  visualizationReasons,
  type ColumnRow,
  type HarmonizeAnalysis,
} from "@/components/harmonize/data-facts";

const RunLandscape = lazyChart(() => import("@/components/campaign/run-landscape").then((m) => m.RunLandscape));

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
export function YourData({ analysis, roles }: { analysis: HarmonizeAnalysis; roles: RolesContext }) {
  const rows = columnRows(analysis, roles);
  return (
    <Section
      id="your-data"
      title="Your data"
      description="What the engine read from your sheet. Every count below comes from the analysis; anything it did not report reads n/a."
    >
      <ColumnTable rows={rows} />
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
        <Excluded analysis={analysis} />
        <SheetReading analysis={analysis} />
      </div>
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
            <TableCell numeric>{formatNumber(r.nonNull, "count")}</TableCell>
            <TableCell numeric>{formatNumber(r.coerced, "count")}</TableCell>
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
            <dd className="text-body tabular-nums text-fg">{formatNumber(f.value, "count")}</dd>
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
                <span className="font-mono text-code text-fg">{c.column}</span>: {formatNumber(c.n, "count")} {c.reason}
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
    { label: "Column names", value: header != null ? `Row ${formatNumber(header + 1, "count")} of the sheet` : "n/a" },
    { label: "Layout", value: orientation ? orientationText(orientation) : "n/a" },
    { label: "Rows read", value: formatNumber(run?.n_rows, "count") },
    { label: "Inputs used", value: formatNumber(run?.n_features ?? analysis.features?.length, "count") },
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
 * the optimizer searches, never as an operating range (the engine computes none).
 */
export function DesignSpace({ analysis }: { analysis: HarmonizeAnalysis }) {
  const rows = designRows(analysis);
  const exclusions = analysis.design_box_exclusions;
  const narrowedNote = designBoxExclusionsNote(exclusions);
  return (
    <Section
      id="design-space"
      title="Explored design space"
      description="The lowest and highest value of each input in your data. This is the search box: Kalos proposes recipes inside it. It is not an operating range, and the engine takes no bounds you enter."
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
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell className="font-mono text-code text-fg">{r.name}</TableCell>
                <TableCell numeric title={r.low != null ? String(r.low) : undefined}>
                  {r.kind === "continuous" ? formatNumber(r.low) : "n/a"}
                </TableCell>
                <TableCell numeric title={r.high != null ? String(r.high) : undefined}>
                  {r.kind === "continuous" ? formatNumber(r.high) : "n/a"}
                </TableCell>
                <TableCell className="whitespace-normal text-caption text-fg-muted">
                  {r.narrowed
                    ? `Narrowed to ${formatNumber(r.narrowed.lower)} to ${formatNumber(r.narrowed.upper)}: ${formatNumber(r.narrowed.n_excluded, "count")} physically impossible ${r.narrowed.n_excluded === 1 ? "value" : "values"} left out of the box`
                    : r.kind === "categorical"
                      ? "Categorical: searched over the levels in your data (levels not listed by the engine)"
                      : r.kind === "unreported"
                        ? "Range not reported by the engine"
                        : ""}
                </TableCell>
              </TableRow>
            ))}
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

/** Correlation map and run map, each one click down; when absent, the engine's reason in plain words. */
export function DataPictures({ analysis }: { analysis: PopulatedPictures }) {
  const reasons = visualizationReasons(analysis);
  const unit = parseUnit(analysis.target);
  return (
    <div className="flex flex-col">
      <Disclosure summary="How the inputs and the target move together" meta="Rank correlation">
        {analysis.correlation && analysis.correlation.labels.length > 0 ? (
          <CorrelationHeatmap labels={correlationLabels(analysis.correlation.labels, analysis.target)} matrix={analysis.correlation.matrix} />
        ) : (
          <Absent text={visualizationAbsentText("correlation", reasons?.correlation ?? null)} raw={reasons?.correlation ?? null} />
        )}
      </Disclosure>
      <Disclosure summary="Your runs by recipe similarity" meta="Run map" className="border-b">
        {analysis.embedding && analysis.embedding.points.length > 0 ? (
          <RunLandscape embedding={analysis.embedding} targetName={analysis.target} unit={unit} />
        ) : (
          <Absent text={visualizationAbsentText("embedding", reasons?.embedding ?? null)} raw={reasons?.embedding ?? null} />
        )}
      </Disclosure>
    </div>
  );
}

type PopulatedPictures = HarmonizeAnalysis & { target: string };

function Absent({ text, raw }: { text: string; raw: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body text-fg-muted">{text}</p>
      {raw ? <p className="text-caption text-fg-muted">Engine note: {raw}</p> : null}
    </div>
  );
}
