"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { PredictedMark, MeasuredMark } from "@/components/campaign/plan/marks";
import { fractionalIndex, parseSurface, peakCell, placeable, rampColor, surfaceSummary, valueT, type PlotPoint, type SurfaceModel } from "@/components/campaign/plan/surface-model";
import { formatNumber } from "@/lib/format";
import { parseUnit } from "@/lib/utils";

/*
 * The model's predicted mean over two inputs, other inputs held at the incumbent
 * recipe (the engine's `response_surface`). Predicted mean only: the engine's
 * uncertainty grid is not shown, and the label says so. Measured runs are dots,
 * proposals are rings (DESIGN.md: predicted and measured are never the same mark).
 *
 * Every cell is a focusable element with one tab stop (roving focus, arrow keys);
 * the readout under the plot names the focused cell, and a sr-only table carries
 * the whole grid for screen readers.
 */

const W = 420;
const H = 340;
const M = { left: 64, right: 16, top: 16, bottom: 56 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

export type SurfaceProposal = PlotPoint;

export function ResponseSurface2D({
  surface,
  target,
  proposals = [],
  id: idProp,
}: {
  /** The engine's `response_surface` field, as received. Anything malformed renders nothing. */
  surface: unknown;
  target: string;
  /** Proposed experiments in input units: `id` is the display label (P1..Pn), x/y the setpoints. */
  proposals?: SurfaceProposal[];
  id?: string;
}) {
  const model = useMemo(() => parseSurface(surface), [surface]);
  if (!model) return null;
  return <Surface model={model} target={target} proposals={proposals} id={idProp} />;
}

function Surface({ model, target, proposals, id: idProp }: { model: SurfaceModel; target: string; proposals: SurfaceProposal[]; id?: string }) {
  const uid = useId();
  const titleId = `${idProp ?? uid}-title`;
  const summaryId = `${idProp ?? uid}-summary`;
  const readoutId = `${idProp ?? uid}-readout`;

  const nx = model.x.vals.length;
  const ny = model.y.vals.length;
  const cellW = PLOT_W / nx;
  const cellH = PLOT_H / ny;
  const fmt = (n: number) => formatNumber(n);
  const peak = useMemo(() => peakCell(model.z), [model.z]);
  const { inside, outside } = useMemo(() => placeable(model, proposals), [model, proposals]);
  const runs = useMemo(
    () => model.runs.filter(([x, y]) => fractionalIndex(model.x.vals, x) != null && fractionalIndex(model.y.vals, y) != null),
    [model],
  );
  const summary = useMemo(
    () => surfaceSummary(model, target, fmt, { runs: runs.length, proposals: inside.length, outside: outside.length }),
    [model, target, runs.length, inside.length, outside.length],
  );

  // Roving focus: one tab stop, on the cell the user last looked at (the peak to start).
  const [active, setActive] = useState<{ row: number; col: number }>(peak);
  const cellRefs = useRef(new Map<string, SVGRectElement>());

  // Names come from the engine as the sheet has them, units included in the name (e.g. "Temperature (C)").
  const targetUnit = parseUnit(target);
  const cellLabel = (r: number, c: number) =>
    `${model.x.name} ${fmt(model.x.vals[c])}, ${model.y.name} ${fmt(model.y.vals[r])}: predicted mean ${fmt(model.z[r][c])}${targetUnit ? ` ${targetUnit}` : ""}`;

  function move(r: number, c: number) {
    const row = Math.min(ny - 1, Math.max(0, r));
    const col = Math.min(nx - 1, Math.max(0, c));
    setActive({ row, col });
    cellRefs.current.get(`${row}-${col}`)?.focus();
  }

  function onKeyDown(e: KeyboardEvent<SVGGElement>) {
    const { row, col } = active;
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(row, col + 1),
      ArrowLeft: () => move(row, col - 1),
      // Higher y is drawn higher, so Up moves to the next row.
      ArrowUp: () => move(row + 1, col),
      ArrowDown: () => move(row - 1, col),
      Home: () => move(row, 0),
      End: () => move(row, nx - 1),
    };
    const handler = keys[e.key];
    if (handler) {
      e.preventDefault();
      handler();
    }
  }

  const activeZ = model.z[active.row][active.col];
  const xTicks = [0, Math.floor((nx - 1) / 2), nx - 1].filter((v, i, a) => a.indexOf(v) === i);
  const yTicks = [0, Math.floor((ny - 1) / 2), ny - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <figure className="flex flex-col gap-3" aria-labelledby={titleId} aria-describedby={summaryId}>
      <figcaption className="flex flex-col gap-1">
        <span id={titleId} className="text-heading text-fg">
          Predicted {target} across two inputs
        </span>
        <span className="text-caption text-fg-muted">Predicted mean only, uncertainty not shown. Other inputs held at the incumbent recipe.</span>
      </figcaption>

      <div className="w-full max-w-[520px] overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[320px]" focusable="false">
          <g role="group" aria-labelledby={titleId} aria-describedby={summaryId} onKeyDown={onKeyDown}>
            {model.z.map((row, r) =>
              row.map((v, c) => {
                const x = M.left + c * cellW;
                const y = M.top + (ny - 1 - r) * cellH;
                const isActive = active.row === r && active.col === c;
                return (
                  <rect
                    key={`${r}-${c}`}
                    ref={(el) => {
                      if (el) cellRefs.current.set(`${r}-${c}`, el);
                      else cellRefs.current.delete(`${r}-${c}`);
                    }}
                    x={x}
                    y={y}
                    width={cellW}
                    height={cellH}
                    style={{ fill: rampColor(valueT(model, v)) }}
                    tabIndex={isActive ? 0 : -1}
                    role="img"
                    aria-label={cellLabel(r, c)}
                    onFocus={() => setActive({ row: r, col: c })}
                    onMouseEnter={() => setActive({ row: r, col: c })}
                    className="surface-cell"
                  />
                );
              }),
            )}
          </g>

          <rect x={M.left} y={M.top} width={PLOT_W} height={PLOT_H} fill="none" style={{ stroke: "var(--border-strong)" }} strokeWidth="1" aria-hidden="true" />

          {xTicks.map((c) => (
            <text key={`xt-${c}`} x={M.left + (c + 0.5) * cellW} y={M.top + PLOT_H + 16} textAnchor="middle" style={{ fill: "var(--fg-muted)" }} fontSize="11" aria-hidden="true">
              {fmt(model.x.vals[c])}
            </text>
          ))}
          {yTicks.map((r) => (
            <text key={`yt-${r}`} x={M.left - 6} y={M.top + (ny - 1 - r + 0.5) * cellH + 4} textAnchor="end" style={{ fill: "var(--fg-muted)" }} fontSize="11" aria-hidden="true">
              {fmt(model.y.vals[r])}
            </text>
          ))}
          <text x={M.left + PLOT_W / 2} y={H - 8} textAnchor="middle" style={{ fill: "var(--fg)" }} fontSize="12" aria-hidden="true">
            {model.x.name}
          </text>
          <text x={14} y={M.top + PLOT_H / 2} textAnchor="middle" transform={`rotate(-90 14 ${M.top + PLOT_H / 2})`} style={{ fill: "var(--fg)" }} fontSize="12" aria-hidden="true">
            {model.y.name}
          </text>

          {runs.map(([xv, yv], k) => {
            const fx = fractionalIndex(model.x.vals, xv) ?? 0;
            const fy = fractionalIndex(model.y.vals, yv) ?? 0;
            const cx = M.left + (fx + 0.5) * cellW;
            const cy = M.top + (ny - 1 - fy + 0.5) * cellH;
            return <MeasuredMark key={`run-${k}`} x={cx - 5} y={cy - 5} halo />;
          })}

          {inside.map((p) => {
            const fx = fractionalIndex(model.x.vals, p.x) ?? 0;
            const fy = fractionalIndex(model.y.vals, p.y) ?? 0;
            const cx = M.left + (fx + 0.5) * cellW;
            const cy = M.top + (ny - 1 - fy + 0.5) * cellH;
            return (
              <g key={p.id}>
                <PredictedMark x={cx - 6} y={cy - 6} halo className="size-3" />
                <text x={cx + 7} y={cy - 6} fontSize="10" style={{ fill: "var(--fg)", stroke: "var(--bg)", strokeWidth: 3, paintOrder: "stroke" }}>
                  {p.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p id={readoutId} className="min-h-5 text-caption text-fg tabular-nums" aria-hidden="true">
        {model.x.name} {fmt(model.x.vals[active.col])}, {model.y.name} {fmt(model.y.vals[active.row])}: predicted mean {fmt(activeZ)}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-fg-muted">
        <span className="inline-flex items-center gap-2">
          <span>{fmt(model.zMin)}</span>
          <span className="flex" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="size-4 border border-border" style={{ background: rampColor(i / 4) }} />
            ))}
          </span>
          <span>{fmt(model.zMax)}</span>
          <span>predicted {targetUnit ? `(${targetUnit})` : "mean"}, lower to higher</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <PredictedMark /> proposed experiment (ring, label P1..Pn)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MeasuredMark /> measured run
        </span>
      </div>

      <p id={summaryId} className="max-w-[72ch] text-body text-fg-muted">
        {summary}
      </p>

      <table className="sr-only">
        <caption>
          Predicted mean {target} by {model.x.name} (columns) and {model.y.name} (rows). Predicted mean only.
        </caption>
        <thead>
          <tr>
            <th scope="col">{model.y.name} by {model.x.name}</th>
            {model.x.vals.map((v, c) => (
              <th key={c} scope="col">
                {fmt(v)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.z
            .map((row, r) => ({ row, r }))
            .reverse()
            .map(({ row, r }) => (
              <tr key={r}>
                <th scope="row">{fmt(model.y.vals[r])}</th>
                {row.map((v, c) => (
                  <td key={c}>{fmt(v)}</td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  );
}
