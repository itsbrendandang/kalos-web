"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { VizDefs } from "@/components/viz/defs";
import { FocusRing, useGridFocus, type Cell } from "@/components/viz/heatmap";
import { ChartTooltip, useChartTip } from "@/components/viz/tooltip";

/*
 * A labelled cell grid for the heatmaps whose cells print text (data quality,
 * residuals by round): row labels in a gutter, column headers, one rect per
 * cell with up to two printed lines, a 2px --fg focus ring, one tab stop with
 * arrow-key movement and Enter to pin (VIZ_SPEC_V2 2.7). Fills, text and
 * tooltips come from the caller; this component draws, it never decides.
 */

export type GridCell = {
  fill: string;
  /** A translucent colour over `fill` (diverging cells), so the printed text stays on a light ground. */
  tint?: { color: string; opacity: number } | null;
  stroke?: string;
  dashed?: boolean;
  lines: [string, string?];
  ink?: string;
  subInk?: string;
  bold?: boolean;
  aria: string;
  tip: ReactNode;
  /** A status glyph drawn in the cell's top-right corner, always paired with a word in `aria` and the tip. */
  glyph?: "outside" | "error" | null;
};

export type GridRow = { key: string; label: string; sub?: string; mono?: boolean; strong?: boolean };
export type GridColumn = { key: string; label: string; sub?: string };

const CHAR_W = 6.6;

export function HeatGrid({
  id,
  rows,
  columns,
  cell,
  width,
  ariaLabel,
  rowH = 40,
  headH = 40,
  minCol = 76,
  maxCol = 132,
  gutterMax = 240,
}: {
  id: string;
  rows: GridRow[];
  columns: GridColumn[];
  /** The cell at (row, col), or null where a ragged row has no cell. */
  cell: (row: number, col: number) => GridCell | null;
  width: number;
  ariaLabel: string;
  rowH?: number;
  headH?: number;
  minCol?: number;
  maxCol?: number;
  gutterMax?: number;
}) {
  const { tip, close, show, pin, hide } = useChartTip();
  // On a narrow screen the labels give way to the cells (they wrap into the tooltip and Data table).
  const gutter = Math.min(gutterMax, Math.max(96, Math.floor(width * 0.36)), Math.ceil(Math.max(8, ...rows.map((r) => Math.max(r.label.length, (r.sub ?? "").length))) * CHAR_W) + 16);
  const col = Math.max(minCol, Math.min(maxCol, Math.floor((width - gutter) / Math.max(1, columns.length))));
  const svgW = gutter + col * columns.length;
  const svgH = headH + rowH * rows.length;
  const cells = useMemo(() => rows.map((_, i) => columns.map((__, j) => cell(i, j))), [rows, columns, cell]);
  const rowLengths = useMemo(() => cells.map((r) => {
    let n = 0;
    r.forEach((c, j) => {
      if (c) n = j + 1;
    });
    return n;
  }), [cells]);
  const tipFor = useCallback(
    (c: Cell, pinned: boolean) => {
      const content = cells[c.row]?.[c.col];
      if (!content) return;
      (pinned ? pin : show)(gutter + (c.col + 1) * col, headH + c.row * rowH, content.tip);
    },
    [cells, gutter, col, headH, rowH, pin, show],
  );
  const focus = useGridFocus(rowLengths, tipFor, close);
  const maxChars = Math.floor((col - 12) / CHAR_W);
  const clip = (t: string) => (t.length > maxChars ? `${t.slice(0, Math.max(1, maxChars - 1))}…` : t);
  const headLines = (label: string) => wrap(label, maxChars);

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg width={svgW} height={svgH} className="block" role="img" aria-label={ariaLabel}>
          <VizDefs id={id} />
          {columns.map((c, j) => {
            const [l1, l2] = c.sub ? [c.label, c.sub] : headLines(c.label);
            return (
              <g key={c.key} aria-hidden>
                <text x={gutter + j * col + 6} y={headH - 22} fontSize={12} className="fill-fg-muted">
                  {clip(l1)}
                </text>
                {l2 ? (
                  <text x={gutter + j * col + 6} y={headH - 8} fontSize={12} className="fill-fg-muted">
                    {clip(l2)}
                  </text>
                ) : null}
              </g>
            );
          })}
          <g role="grid" aria-label={`${ariaLabel} Arrow keys move between cells; Enter pins the details.`} {...focus.containerProps}>
            {rows.map((r, i) => {
              const y = headH + i * rowH;
              return (
                <g key={r.key} role="row">
                  <g aria-hidden>
                    <text x={0} y={r.sub ? y + rowH / 2 - 3 : y + rowH / 2} dy={r.sub ? 0 : "0.33em"} fontSize={12} className={`${r.strong ? "fill-fg font-medium" : "fill-fg"}${r.mono ? " font-mono" : ""}`}>
                      {clipTo(r.label, gutter - 8, r.mono ? 7.4 : CHAR_W)}
                    </text>
                    {r.sub ? (
                      <text x={0} y={y + rowH / 2 + 12} fontSize={12} className="fill-fg-muted">
                        {clipTo(r.sub, gutter - 8, CHAR_W)}
                      </text>
                    ) : null}
                  </g>
                  {columns.map((c, j) => {
                    const cellAt = cells[i][j];
                    if (!cellAt) return null;
                    const x = gutter + j * col;
                    const two = cellAt.lines[1] != null;
                    return (
                      <g
                        key={c.key}
                        role="gridcell"
                        aria-label={cellAt.aria}
                        onMouseEnter={() => tipFor({ row: i, col: j }, false)}
                        onMouseLeave={hide}
                        onClick={() => {
                          focus.setActive({ row: i, col: j });
                          tipFor({ row: i, col: j }, true);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <rect
                          x={x + 1}
                          y={y + 1}
                          width={col - 2}
                          height={rowH - 2}
                          rx={3}
                          fill={cellAt.fill}
                          stroke={cellAt.stroke ?? "var(--chart-grid)"}
                          strokeWidth={0.75}
                          strokeDasharray={cellAt.dashed ? "2 2" : undefined}
                        />
                        {cellAt.tint ? <rect x={x + 1} y={y + 1} width={col - 2} height={rowH - 2} rx={3} fill={cellAt.tint.color} fillOpacity={cellAt.tint.opacity} aria-hidden /> : null}
                        <text
                          x={x + 6}
                          y={two ? y + rowH / 2 - 4 : y + rowH / 2}
                          dy={two ? 0 : "0.33em"}
                          fontSize={12}
                          style={{ fill: cellAt.ink ?? "var(--fg)" }}
                          className={cellAt.bold ? "tabular-nums font-medium" : "tabular-nums"}
                          aria-hidden
                        >
                          {clip(cellAt.lines[0])}
                        </text>
                        {two ? (
                          <text x={x + 6} y={y + rowH / 2 + 12} fontSize={12} style={{ fill: cellAt.subInk ?? cellAt.ink ?? "var(--fg-muted)" }} className="tabular-nums" aria-hidden>
                            {clip(cellAt.lines[1] as string)}
                          </text>
                        ) : null}
                        {cellAt.glyph === "outside" ? (
                          <g stroke="var(--warn)" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
                            <line x1={x + col - 14} x2={x + col - 7} y1={y + 6} y2={y + 13} />
                            <line x1={x + col - 14} x2={x + col - 7} y1={y + 13} y2={y + 6} />
                          </g>
                        ) : null}
                        {cellAt.glyph === "error" ? (
                          <g aria-hidden>
                            <path d={`M${x + col - 11} ${y + 4} L${x + col - 4} ${y + 15} L${x + col - 18} ${y + 15} Z`} fill="var(--bad)" />
                            <text x={x + col - 11} y={y + 14} textAnchor="middle" fontSize={9} style={{ fill: "var(--surface)" }} fontWeight={700}>
                              !
                            </text>
                          </g>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {focus.focused && focus.active ? <FocusRing x={gutter + focus.active.col * col} y={headH + focus.active.row * rowH} w={col} h={rowH} /> : null}
          </g>
        </svg>
      </div>
      <ChartTooltip tip={tip} onClose={close} width={width} />
    </div>
  );
}

function clipTo(text: string, width: number, charW: number): string {
  const max = Math.floor(width / charW);
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

/** Two header lines at most, split on a space near the middle. */
function wrap(label: string, max: number): [string, string?] {
  if (label.length <= max) return [label];
  const cut = label.lastIndexOf(" ", max);
  if (cut <= 0) return [label];
  return [label.slice(0, cut), label.slice(cut + 1)];
}
