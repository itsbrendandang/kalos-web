"use client";

import { useMemo } from "react";
import { SurfacePair } from "@/components/viz/charts/surface-pair";
import { ChartFrame } from "@/components/viz/frame";
import { parseSurface, type PlotPoint } from "@/components/campaign/plan/surface-model";
import { parseUnit } from "@/lib/num";
import type { Source } from "@/lib/source";
import { toSurfacePair } from "@/lib/viz-data/surface-pair";

/*
 * The engine's `response_surface` on the Predict page, drawn as the C5
 * SurfacePair: model-predicted mean as filled contour bands, the engine's
 * posterior SD beside it only when the engine sent `std`, measured runs
 * (projected), the incumbent, and the batch's proposals numbered P1..Pn.
 * Anything malformed or absent renders nothing (absent rule); an engine
 * `reason` for not computing the surface renders "Not scored: <reason>".
 */

export type SurfaceProposal = PlotPoint;

const FALLBACK_SOURCE: Source = { label: "Engine analysis", field: "response_surface", basis: "predicted" };

export function ResponseSurface2D({
  surface,
  target,
  proposals = [],
  unit: unitProp,
  source,
  reason,
  stale,
  width,
  bare,
}: {
  /** The engine's `response_surface` field, as received. Anything malformed renders nothing. */
  surface: unknown;
  /** The target header as the sheet has it ("Titer (g/L)"): the unit is parsed from it, never invented. */
  target: string;
  /** Proposed experiments in input units: `id` is the display label (P1..Pn, as the batch rows), x/y the setpoints. */
  proposals?: SurfaceProposal[];
  /** The target's unit, when the caller already stripped it from `target`. Defaults to the unit parsed from `target`. */
  unit?: string | null;
  /** Where the surface came from (sourceFromAnalysis(d, "response_surface", "predicted")). */
  source?: Source;
  /** The engine's reason for not computing the surface (`visualization_reasons.response_surface`), when absent. */
  reason?: string | null;
  stale?: { nNew: number } | null;
  /** Fixed width (report/print, tests); measured from the container otherwise. */
  width?: number;
  bare?: boolean;
  /** @deprecated kept for call-site compatibility; ids are generated. */
  id?: string;
}) {
  const model = useMemo(() => parseSurface(surface), [surface]);
  const data = useMemo(() => (model ? toSurfacePair(model, proposals) : null), [model, proposals]);
  const parsed = parseUnit(target);
  const name = parsed.name;
  const unit = unitProp !== undefined ? unitProp : parsed.unit;
  if (!data) {
    if (reason && reason.trim())
      return (
        <ChartFrame title={`Model-predicted ${name} across two inputs`} state={{ kind: "not-scored", reason: reason.trim() }} bare={bare}>
          {() => null}
        </ChartFrame>
      );
    return null;
  }
  return <SurfacePair {...data} target={name} unit={unit} source={source ?? FALLBACK_SOURCE} stale={stale} width={width} bare={bare} />;
}
