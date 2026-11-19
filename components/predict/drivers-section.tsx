"use client";

import { DriversList } from "@/components/campaign/drivers-list";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { shapeText, splitDrivers, type PredictAnalysis } from "@/components/predict/predict-view";
import { driverSelectionNote } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { topDrivers } from "@/lib/overview";

/**
 * What goes with the target. Only drivers the engine marks `significant`
 * (95% CI excludes zero AND survives FDR control) are presented as findings;
 * every other tested input is listed as not distinguishable from noise. The
 * engine's selection note says how many inputs were tested, and the model's
 * per-input response shapes sit in a disclosure when the engine computed them.
 */
export function DriversSection({ d, targetName }: { d: PredictAnalysis; targetName: string }) {
  const { findings, noise } = splitDrivers(d.drivers);
  const selection = driverSelectionNote(d.driver_selection);
  const shapes = d.gp_shapes;
  const untested = d.driver_selection ? d.driver_selection.n_tested - d.driver_selection.n_reported : 0;

  return (
    <Section id="predict-drivers" title={`What goes with ${targetName}`} description="Rank correlations in the runs so far: associations, not causes.">
      {findings.length ? (
        <DriversList drivers={topDrivers(findings, findings.length)} targetName={targetName} />
      ) : (
        <p className="text-body text-fg">
          {d.drivers?.length ? "No input is distinguishable from noise yet." : "This analysis reported no drivers."}
        </p>
      )}
      {noise.length ? (
        <p className="text-body text-fg-muted">
          <span className="text-fg">Not distinguishable from noise</span> after correcting for testing every input: {noise.map((n) => n.name).join(", ")}.
          {untested > 0 ? ` ${formatNumber(untested, "count")} more tested ${untested === 1 ? "input was" : "inputs were"} not reported.` : ""}
        </p>
      ) : null}
      {selection ? <p className="text-caption text-fg-muted">How these were chosen: {selection}</p> : null}

      {shapes?.available && shapes.features.length ? (
        <Disclosure summary="How the model responds to each input" meta="model prediction">
          <p className="mb-3 text-caption text-fg-muted">
            The model&apos;s predicted response along one input at a time, other inputs held at the {shapes.swept_at || "reference recipe"}. A model prediction, not measured data.
          </p>
          <ul className="divide-y divide-border border-y border-border">
            {shapes.features.map((f) => (
              <li key={f.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="font-mono text-code text-fg">{f.name}</span>
                <span className="text-body text-fg">{shapeText(f)}</span>
                <span className="w-full text-caption text-fg-muted tabular-nums">
                  Relevance {formatNumber(f.relevance)}
                  {f.peak_gain != null ? `, predicted peak gain ${formatNumber(f.peak_gain)}` : ""}
                  {f.missed_by_spearman ? ". A rank correlation alone would miss this input." : ""}
                </span>
              </li>
            ))}
          </ul>
          {shapes.unmodeled?.length ? <p className="mt-3 text-caption text-fg-muted">Not covered by these shapes: {shapes.unmodeled.join("; ")}.</p> : null}
        </Disclosure>
      ) : shapes && !shapes.available ? (
        <p className="text-caption text-fg-muted" title={shapes.reason ?? undefined}>
          The engine did not compute per-input response shapes for this fit.
        </p>
      ) : null}
    </Section>
  );
}
