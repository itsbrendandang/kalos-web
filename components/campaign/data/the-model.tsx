"use client";

// "The model": what Kalos built from this sheet, shown after the fit. One plain verdict on whether the
// model's ranking can be leaned on (its why-line under it), the likely-range check, then the predictions for
// runs the model had not seen, what the model leans on, and the predicted slice. Every number comes from the
// analysis; the wording states what the model did, never what a recipe should do. The engine's own words
// (Spearman, interval, posterior, incumbent) sit one click down, in the disclosures.
import { DriverList, ModelFigure, SliceFigure } from "@/components/campaign/data/model-figures";
import { predictedVsMeasured } from "@/components/campaign/data/meaning";
import { calibrationLine, calibrationVerdict, driverRows, surfaceSlice } from "@/components/campaign/data/model-math";
import { Badge } from "@/components/ui/badge";
import { Verdict } from "@/components/kit/verdict";
import { Disclosure } from "@/components/kit/disclosure";
import { lazyChart } from "@/components/kit/lazy-chart";
import { Section } from "@/components/kit/section";
import { WhyLine } from "@/components/kit/why-line";
import { reliabilityVerdict, type PopulatedResult, type ReliabilityVerdict } from "@/lib/api";
import { formatNumber, formatRange } from "@/lib/format";
import { trustPlain } from "@/lib/plain";
import { parseUnit } from "@/lib/utils";

const PredVsMeasured = lazyChart(() => import("@/components/campaign/pred-vs-measured").then((m) => m.PredVsMeasured));

/** The one plain sentence for the reliability state; never stronger than the engine's own reason, which sits in the disclosure. */
export function rankingSentence(state: ReliabilityVerdict["state"]): string {
  if (state === "reliable") return "The model put past runs in the right order most of the time.";
  if (state === "insufficient") return "Not enough runs to tell whether the model puts past runs in the right order.";
  return "The model has not yet shown it can put past runs in the right order.";
}

/** The badge word for the reliability state. */
export function rankingWord(state: ReliabilityVerdict["state"]): string {
  if (state === "reliable") return "Reliable";
  if (state === "insufficient") return "Not enough runs to tell";
  return "Not yet reliable";
}

export function TheModel({ analysis }: { analysis: PopulatedResult }) {
  const target = analysis.target;
  const unit = parseUnit(target);
  const verdict = reliabilityVerdict(analysis);
  const trust = trustPlain(verdict);
  const ranges = calibrationVerdict(analysis.reliability?.calibration);
  const rows = driverRows(analysis.gp_shapes, target);
  const slice = surfaceSlice(analysis.response_surface);
  const oof = analysis.oof ?? [];
  const rho = analysis.reliability?.spearman ?? analysis.cv_spearman ?? null;
  const ci = analysis.reliability?.ci95 ?? analysis.cv_ci95 ?? null;
  const tone = trust.level === "good" ? "good" : trust.level === "warn" ? "warn" : "neutral";
  return (
    <Section title="The model" description="What Kalos built from this sheet. Its numbers are predicted, not measured.">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Verdict tone={tone}>{rankingSentence(verdict.state)}</Verdict>
          <div className="ml-7 flex flex-col gap-2">
            <WhyLine code={verdict.state} />
            <p className="flex flex-wrap items-center gap-2 text-label text-fg-muted">
              Can you trust its ranking?
              <Badge tone={tone}>{rankingWord(verdict.state)}</Badge>
            </p>
            <p className="text-body text-fg">{ranges.sentence}</p>
            <WhyLine code={ranges.state} />
            {rho != null && ci == null ? <WhyLine code="cv_ci_unavailable" /> : null}
            <Disclosure summary="How the model was scored" className="border-t-0">
              <div className="flex flex-col gap-2 text-body text-fg-muted">
                <p>{trust.gloss}</p>
                <p>{trust.sentence}</p>
                {rho != null ? (
                  <p>
                    Rank agreement (Spearman) on held-out runs: {formatNumber(rho, "corr")}
                    {ci ? ` (95% interval ${formatRange(ci[0], ci[1], "corr")})` : ""}. 1 means the model orders every unseen run correctly, 0 means no better than chance.
                  </p>
                ) : null}
                <p>Likely-range check (calibration): {calibrationLine(analysis.reliability?.calibration)}</p>
              </div>
            </Disclosure>
          </div>
        </div>

        <ModelFigure
          caption="Predicted against measured"
          note={
            oof.length
              ? `${predictedVsMeasured(oof, analysis.conformal_q)} ${formatNumber(oof.length, "count")} past runs, each predicted by a model that had not seen it. Dots on the dashed line were predicted exactly.`
              : "Kalos sent no predictions for runs the model had not seen."
          }
        >
          {oof.length ? (
            <PredVsMeasured oof={oof} targetName={target} unit={unit} />
          ) : null}
        </ModelFigure>

        <ModelFigure
          caption="What the model leans on"
          note={
            <div className="flex flex-col gap-1">
              <p>
                The bar is how much the model leans on each input; the shares add to 100%. The shape is how predicted {target} changes along that input, with the other inputs held at your best recipe
                so far. These are patterns the model found in these runs, not causes.
              </p>
              <Disclosure summary="As Kalos wrote it" className="border-0 px-0">
                <p className="pb-2 text-fg-muted">
                  The share is each input&apos;s part of the model&apos;s fitted sensitivity (ARD relevance), normalised to 100%. Shapes come from the fitted model&apos;s response along each input, with the others held at
                  the incumbent recipe. &ldquo;Asking only whether more is better&rdquo; is a rank correlation (Spearman); the flag is the engine&apos;s own.
                </p>
              </Disclosure>
            </div>
          }
        >
          {rows.length ? <DriverList rows={rows} /> : <p className="text-body text-fg-muted">Kalos gave no shape reading for this sheet.</p>}
        </ModelFigure>

        {slice ? (
          <ModelFigure
            caption={`Predicted ${target} along ${slice.xName}`}
            note={
              <Disclosure summary="What the held value means" className="border-0 px-0">
                <p className="pb-2 text-fg-muted">
                  The other input is held at the value Kalos swept at (the incumbent recipe, your best so far). It is one slice of a two-input surface, so other slices can look different. The line is the
                  posterior mean; the shading is one posterior standard deviation either side of it, the model&apos;s uncertainty about the mean and not the spread of runs.
                </p>
              </Disclosure>
            }
          >
            <SliceFigure slice={slice} target={target} />
          </ModelFigure>
        ) : (
          <ModelFigure caption={`Predicted ${target} across two inputs`}>
            <p className="text-body text-fg-muted">Kalos did not send predictions across two inputs for this sheet.</p>
          </ModelFigure>
        )}
      </div>
    </Section>
  );
}
