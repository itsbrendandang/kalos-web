"use client";

import { useMemo } from "react";
import { DriverForest } from "@/components/viz/charts/driver-forest";
import { Section } from "@/components/kit/section";
import type { PredictAnalysis } from "@/components/predict/predict-view";
import { sourceFromAnalysis } from "@/lib/source";
import { toDriverForest } from "@/lib/viz-data/driver-forest";

/**
 * What goes with the target: the C4 DriverForest. Every reported input is a
 * forest row with the engine's 95% CI (`ci95`); only drivers the engine marks
 * `significant` (CI excludes zero AND survives FDR control) are drawn as
 * findings (filled), the rest hollow with the test they failed. The engine's
 * selection note says how many inputs were tested, and the GP model shape
 * column reads "Not scored: <reason>" when the engine declined it.
 */
export function DriversSection({ d, targetName }: { d: PredictAnalysis; targetName: string }) {
  const data = useMemo(() => toDriverForest({ drivers: d.drivers, driver_selection: d.driver_selection, gp_shapes: d.gp_shapes }), [d.drivers, d.driver_selection, d.gp_shapes]);
  const source = useMemo(() => sourceFromAnalysis(d, "drivers", "derived", "Spearman ρ, bootstrap CI"), [d]);
  const sig = data.drivers.filter((x) => x.significant);

  return (
    <Section id="predict-drivers" title={`What goes with ${targetName}`} description="Rank correlations in the runs so far: associations, not causes.">
      {data.drivers.length ? (
        <p className="text-body text-fg">
          {sig.length
            ? `${sig.map((x) => x.name).join(", ")} ${sig.length === 1 ? "is" : "are"} distinguishable from noise after correcting for testing every input.`
            : "No input is distinguishable from noise yet after correcting for testing every input."}
        </p>
      ) : null}
      <DriverForest {...data} target={targetName} source={source} />
      {data.shapeCaveats.length ? <p className="text-caption text-fg-muted">The model shapes do not cover: {data.shapeCaveats.join("; ")}.</p> : null}
    </Section>
  );
}
