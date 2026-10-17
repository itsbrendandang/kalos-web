"use client";

import { Fragment } from "react";
import { seqColor, SEQ_GRADIENT_CSS } from "@/components/dashboard/heat-scale";
import { STATUS_LABEL } from "@/components/plate/status-chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { COLS, ROWS, type Well } from "@/lib/plate-data";

/** White above this normalized intensity, else the ink color - keeps marks/values legible on the ramp. */
const LIGHT_TEXT_CUTOFF = 0.62;

interface PlateHeatmapProps {
  wells: Record<string, Well>;
  deltaMin: number;
  deltaMax: number;
  selectedWellId: string;
  onSelect: (id: string) => void;
  showFlags: boolean;
  showValues: boolean;
}

/** 96-well plate heatmap, colored by delta-OD on the shared blue sequential ramp. */
export function PlateHeatmap({
  wells,
  deltaMin,
  deltaMax,
  selectedWellId,
  onSelect,
  showFlags,
  showValues,
}: PlateHeatmapProps) {
  const span = deltaMax - deltaMin || 1;

  return (
    <div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "28px repeat(12, minmax(0, 1fr))" }}>
        <div />
        {COLS.map((c) => (
          <div key={c} className="text-center font-mono text-[11px] font-semibold text-muted">
            {c}
          </div>
        ))}
        {ROWS.map((r) => (
          <Fragment key={r}>
            <div className="flex items-center justify-center font-mono text-[11px] font-semibold text-muted">{r}</div>
            {COLS.map((c) => {
              const id = `${r}${c}`;
              const w = wells[id];
              // A missing well (no reader payload for this position) renders as an
              // empty, non-interactive "no data" cell - never as a zero-valued well,
              // which would misreport a real absence as a real (low) measurement.
              if (!w) {
                return (
                  <div
                    key={id}
                    aria-label={`${id} · no data`}
                    className="aspect-square rounded-[6px] ring-1 ring-border"
                    style={{
                      background:
                        "repeating-linear-gradient(45deg, var(--border), var(--border) 3px, var(--card) 3px, var(--card) 6px)",
                    }}
                  />
                );
              }
              const t = (w.metrics.deltaOD - deltaMin) / span;
              const markColor = t > LIGHT_TEXT_CUTOFF ? "#ffffff" : "var(--blue-deep)";
              const valueColor = t > LIGHT_TEXT_CUTOFF ? "#ffffff" : "var(--fg)";
              const selected = selectedWellId === id;
              return (
                <Tooltip key={id}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => onSelect(id)}
                        aria-pressed={selected}
                        className={cn(
                          "relative aspect-square rounded-[6px] outline-none transition-[filter] hover:brightness-110 focus-visible:brightness-110",
                          selected ? "ring-2 ring-fg ring-offset-1 ring-offset-card" : "ring-1 ring-white/60",
                        )}
                        style={{ background: seqColor(w.metrics.deltaOD, deltaMin, deltaMax) }}
                      />
                    }
                  >
                    {w.isControl ? (
                      <span
                        className="absolute top-0.5 left-1 font-mono text-[13px] leading-none font-bold"
                        style={{ color: markColor }}
                      >
                        {w.controlType === "positive" ? "+" : "−"}
                      </span>
                    ) : null}
                    {showFlags && w.flags.length > 0 ? (
                      <span
                        className="absolute top-0.5 right-1 text-[9px] leading-none"
                        style={{ color: markColor }}
                        aria-label="flagged"
                      >
                        ⚑
                      </span>
                    ) : null}
                    {showValues ? (
                      <span
                        className="absolute inset-0 flex items-center justify-center font-mono text-[9.5px] font-bold tabular-nums"
                        style={{ color: valueColor }}
                      >
                        {w.metrics.deltaOD.toFixed(2)}
                      </span>
                    ) : null}
                    <span className="sr-only">
                      Well {id}, {w.condition}, Δ OD {w.metrics.deltaOD.toFixed(3)}
                      {w.isControl ? `, ${w.controlType} control` : ""}
                      {w.status ? `, ${STATUS_LABEL[w.status]}` : ""}
                      {showFlags && w.flags.length > 0 ? ", flagged" : ""}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-left">
                      <div className="font-mono font-semibold">
                        {id} · {w.condition}
                      </div>
                      <div>Δ OD {w.metrics.deltaOD.toFixed(3)}</div>
                      {w.status ? <div>{STATUS_LABEL[w.status]}</div> : null}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="mt-2.5 flex items-center gap-2.5 text-[11.5px] text-muted">
        <span>Δ OD (max − t₀) · low</span>
        <span className="h-2.5 flex-1 rounded-full border border-border" style={{ background: SEQ_GRADIENT_CSS }} />
        <span>
          high ({deltaMin.toFixed(2)} → {deltaMax.toFixed(2)} ΔOD)
        </span>
      </div>
    </div>
  );
}
