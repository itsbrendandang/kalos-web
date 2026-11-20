"use client";

import { useCallback } from "react";
import { hatchFill } from "@/components/viz/defs";
import { ChartFrame } from "@/components/viz/frame";
import { HeatGrid, type GridCell } from "@/components/viz/heat-grid";
import { LegendHatchDefs, StepLegend } from "@/components/viz/heatmap";
import { TipRow, TipSource } from "@/components/viz/tooltip";
import { formatValue } from "@/lib/num";
import type { Source } from "@/lib/source";
import { dataQualityTable, describeDataQuality, qualityCellText, type DataQuality, type QualityCell } from "@/lib/viz-data/data-quality";
import { ordInk, rampVar, SHARE_EDGES } from "@/lib/viz-data/heat";

/*
 * H5 DataQualityHeatmap: sheet columns x what the engine found in their cells.
 * Fill = the count as a share of the sheet's rows (5 stepped classes, edges
 * printed); the count is printed in every cell. 0 is the dotted empty style,
 * "not checked" (a column the model did not use) is the hatch with its reason.
 * An error-severity finding adds a --bad glyph and the word; a refusal or an
 * excluded run is never coloured red.
 */
const ID = "data-quality";
const count = (n: number | null | undefined) => formatValue(n, { quantity: "count" }).text;
const pct = (x: number) => formatValue(x, { quantity: "pct" }).text;

export function DataQualityHeatmap({ data, source, width: fixedWidth, bare = false }: { data: DataQuality; source: Source; width?: number; bare?: boolean }) {
  const description = describeDataQuality(data);
  const steps = SHARE_EDGES.slice(1).map((hi, i) => ({ k: i + 1, label: `${i === 0 ? ">0" : pct(SHARE_EDGES[i])}–${pct(hi)}` }));
  const cell = useCallback((i: number, j: number): GridCell | null => toGridCell(data, i, j, source), [data, source]);
  return (
    <ChartFrame
      bare={bare}
      title="Data check by column"
      subtitle={`What the engine found in each column's cells${data.nRows != null ? ` across ${count(data.nRows)} rows` : ""}. The count is printed in every cell; the shade is its share of the rows.`}
      height={40 + 40 * data.rows.length}
      width={fixedWidth}
      description={description}
      data={dataQualityTable(data)}
      legend={
        <>
          <LegendHatchDefs id={`${ID}-legend`} />
          <StepLegend ramp="ord" title="Share of rows:" steps={steps} empty="0" missing="not checked (column left out of the fit)" hatchId={`${ID}-legend`} />
        </>
      }
      footer={
        <>
          {data.rowsDropped != null || data.censoredRowsExcluded != null ? (
            <span className="mb-1 block text-fg">
              Runs left out of the fit: {count(data.rowsDropped)} for a missing or non-numeric cell, {count(data.censoredRowsExcluded)} for a censored value. Nothing was imputed.
            </span>
          ) : null}
          {data.sheetFindings.length ? (
            <span className="mb-1 block">Whole-sheet findings: {data.sheetFindings.map((f) => f.message).join(" · ")}</span>
          ) : null}
          From: {source.label} · provenance, data_drops.cells_by_column, data_drops.blank_cells_as_absent, validation.findings{source.engineVersion ? ` · engine ${source.engineVersion}` : ""}
        </>
      }
    >
      {(width) => (
        <HeatGrid
          id={ID}
          width={width}
          ariaLabel={description}
          rows={data.rows.map((r) => ({ key: r.name, label: r.name, sub: r.roleText, mono: true, strong: r.role === "target" }))}
          columns={data.columns.map((c) => ({ key: c.key, label: c.label }))}
          cell={cell}
          rowH={40}
          minCol={84}
          maxCol={120}
        />
      )}
    </ChartFrame>
  );
}

function toGridCell(q: DataQuality, i: number, j: number, source: Source): GridCell {
  const c = q.cells[i][j];
  const row = q.rows[i];
  const column = q.columns[j];
  const text = qualityCellText(c);
  const aria = `${row.name}, ${column.label}: ${ariaText(c)}`;
  const tip = <QualityTip q={q} c={c} i={i} j={j} source={source} />;
  switch (c.kind) {
    case "filled":
      return { fill: "var(--surface)", lines: [text, c.share != null ? `${pct(c.share)} of rows` : undefined], aria, tip, subInk: "var(--fg-muted)" };
    case "expected":
      return { fill: "var(--surface)", lines: [text], ink: "var(--fg-muted)", aria, tip };
    case "not-checked":
      return { fill: hatchFill(ID), stroke: "var(--chart-refused)", lines: [text], ink: "var(--fg-muted)", aria, tip };
    case "note":
      return { fill: "var(--surface)", lines: [text], ink: c.severity === "error" ? "var(--bad)" : "var(--fg)", aria, tip, glyph: c.severity === "error" ? "error" : null };
    case "count":
      if (c.n === 0) return { fill: "var(--surface)", dashed: true, lines: ["0"], ink: "var(--fg-muted)", aria, tip };
      return {
        fill: rampVar("ord", c.cls),
        lines: [text, c.share != null ? pct(c.share) : undefined],
        ink: ordInk(c.cls),
        subInk: ordInk(c.cls),
        bold: true,
        aria,
        tip,
        glyph: c.severity === "error" ? "error" : null,
      };
  }
}

function ariaText(c: QualityCell): string {
  switch (c.kind) {
    case "filled":
      return `${count(c.n)} filled cells`;
    case "expected":
      return `${count(c.n)} text cells, expected for labels`;
    case "not-checked":
      return `not checked: ${c.reason}`;
    case "note":
      return `${c.severity}: ${c.reasons.join("; ")}`;
    case "count":
      return `${count(c.n)} cells${c.share != null ? ` (${pct(c.share)} of rows)` : ""}${c.severity === "error" ? ", error" : ""}${c.reasons.length ? `: ${c.reasons.join("; ")}` : ""}`;
  }
}

function QualityTip({ q, c, i, j, source }: { q: DataQuality; c: QualityCell; i: number; j: number; source: Source }) {
  const row = q.rows[i];
  const column = q.columns[j];
  const field =
    column.key === "filled"
      ? `provenance[${i}].non_null`
      : column.key === "blank_absent"
        ? `data_drops.blank_cells_as_absent.${row.name}`
        : column.key.startsWith("check:")
          ? `validation.findings (check ${column.key.slice(6)}, column ${row.name})`
          : `data_drops.cells_by_column.${row.name}.${column.key}`;
  return (
    <div className="flex flex-col gap-1">
      <p className="pr-5 text-label text-fg">
        <span className="font-mono">{row.name}</span> · {column.label}
      </p>
      <p className="text-fg-muted">{column.help}.</p>
      <TipRow label="Role">{row.roleText}</TipRow>
      {"n" in c ? <TipRow label="Cells">{count(c.n)}</TipRow> : null}
      {"share" in c && c.share != null ? <TipRow label="Share of rows">{pct(c.share)}</TipRow> : null}
      {c.kind === "not-checked" ? <p className="text-fg-muted">Not checked: {c.reason}.</p> : null}
      {(c.kind === "count" || c.kind === "note" || c.kind === "expected") && c.reasons.length ? (
        <ul className="list-disc pl-4 text-fg">
          {c.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {c.kind === "count" && c.severity === "error" ? <p className="text-bad">Error: fix this before relying on the sheet.</p> : null}
      <TipSource>
        {field} · {source.label}
      </TipSource>
    </div>
  );
}
