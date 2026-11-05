"use client";

// "The model": what the engine fitted to this sheet, shown after the fit. One plain verdict on whether the
// model's ranking can be leaned on, then the held-out predictions, the driver shapes, and the response slice.
// Every number comes from the analysis; the wording states what the model did, never what a recipe should do.
import { DriverList, ModelFigure, SliceFigure } from "@/components/campaign/data/model-figures";
import { calibrationLine, driverRows, surfaceSlice } from "@/components/campaign/data/model-math";
import { Badge } from "@/components/ui/badge";
import { Verdict } from "@/components/kit/verdict";
import { Disclosure } from "@/components/kit/disclosure";
import { lazyChart } from "@/components/kit/lazy-chart";
import { Section } from "@/components/kit/section";
import { reliabilityVerdict, type PopulatedResult } from "@/lib/api";
import { formatNumber, formatRange } from "@/lib/format";
import { trustPlain } from "@/lib/plain";
import { parseUnit } from "@/lib/utils";

const PredVsMeasured = lazyChart(() => import("@/components/campaign/pred-vs-measured").then((m) => m.PredVsMeasured));

export function TheModel({ analysis }: { analysis: PopulatedResult }) {
  const target = analysis.target;
  const unit = parseUnit(target);
  const verdict = reliabilityVerdict(analysis);
  const trust = trustPlain(verdict);
  const rows = driverRows(analysis.gp_shapes, target);
  const slice = surfaceSlice(analysis.response_surface);
  const oof = analysis.oof ?? [];
  const rho = analysis.reliability?.spearman ?? analysis.cv_spearman ?? null;
  const ci = analysis.reliability?.ci95 ?? analysis.cv_ci95 ?? null;
  return (
    <Section title="The model" description="Fitted by the engine to this sheet. Its predictions are model outputs, not measurements.">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Verdict
            tone={trust.level === "good" ? "good" : trust.level === "warn" ? "warn" : "neutral"}
            detail={
              <div className="flex flex-col gap-2">
                <p>{trust.gloss}</p>
                {rho != null ? (
                  <p>
                    Rank agreement on held-out runs is {formatNumber(rho, "corr")}
                    {ci ? ` (95% interval ${formatRange(ci[0], ci[1], "corr")})` : ""}. 1 means the model orders every unseen run correctly, 0 means no better than chance.
                  </p>
                ) : null}
                <p>{calibrationLine(analysis.reliability?.calibration)}</p>
              </div>
            }
          >
            {trust.sentence}
          </Verdict>
          <p className="flex flex-wrap items-center gap-2 text-label text-fg-muted">
            Can you trust its ranking?
            <Badge tone={trust.level === "good" ? "good" : trust.level === "warn" ? "warn" : "neutral"}>{trust.word}</Badge>
          </p>
        </div>

        <ModelFigure
          caption="Predicted against measured"
          note={
            oof.length
              ? `${formatNumber(oof.length, "count")} held-out runs, each predicted by a model that had not seen it. Dots on the dashed line were predicted exactly.`
              : "The engine sent no held-out predictions for this sheet."
          }
        >
          {oof.length ? (
            <PredVsMeasured oof={oof} targetName={target} unit={unit} />
          ) : null}
        </ModelFigure>

        <ModelFigure
          caption="Driver effects"
          note="Relevance is each input's share of the model's fitted sensitivity; the shares add to 100%. Shapes come from the fitted model's response along each input, with the others held at the incumbent recipe. They are associations in these runs, not causes."
        >
          {rows.length ? <DriverList rows={rows} /> : <p className="text-body text-fg-muted">The engine gave no shape reading for this sheet.</p>}
        </ModelFigure>

        {slice ? (
          <ModelFigure
            caption={`Predicted ${target} along ${slice.xName}`}
            note={
              <Disclosure summary="What the held value means" className="border-0 px-0">
                <p className="pb-2 text-fg-muted">
                  The other input is held at the value the engine swept at (the incumbent recipe). It is one slice of a two-input surface, so other slices can look different.
                </p>
              </Disclosure>
            }
          >
            <SliceFigure slice={slice} target={target} />
          </ModelFigure>
        ) : (
          <ModelFigure caption="Response surface">
            <p className="text-body text-fg-muted">The engine did not return a response surface for this sheet.</p>
          </ModelFigure>
        )}
      </div>
    </Section>
  );
}
