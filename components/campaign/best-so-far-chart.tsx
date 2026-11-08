"use client";

import { ChartFrame } from "@/components/kit/chart-frame";
import { LineChart } from "@/components/tremor/line-chart";
import { formatNumber } from "@/lib/format";
import { bestSoFarSeries } from "@/lib/overview";
import type { ActiveCampaign } from "@/lib/workbench";

const roundName = (r: string | number) => (Number(r) === 0 ? "Upload" : `Round ${r}`);

/**
 * Measured best-so-far by round. Never a prediction; gaps stay gaps.
 * Defaults match Learn: accent series inside the rounded card.
 * The campaign home opts into the pilot foreground series and a hairline section.
 */
export function BestSoFarChart({
  campaign,
  unit,
  series = "accent",
  frame = "card",
}: {
  campaign: ActiveCampaign;
  unit: string;
  series?: "accent" | "measured";
  frame?: "card" | "rule";
}) {
  const points = bestSoFarSeries(campaign);
  const measuredRounds = points.filter((p) => p.best != null).length;
  return (
    <ChartFrame
      title="Best so far, by round"
      unit={unit || undefined}
      n={campaign.n_base}
      method="The highest measured value in the dataset after each round's results were added. Round 0 is the uploaded run sheet. Measured values only, never predictions."
      state={measuredRounds < 2 ? "insufficient" : "ready"}
      insufficientText="The trend appears once a round's results have been added to the model."
      variant={frame}
    >
      <LineChart
        className="h-64"
        data={points}
        index="round"
        categories={["best"]}
        colors={series === "measured" ? ["overviewMeasured"] : ["accent"]}
        showLegend={false}
        showDots
        autoMinValue
        connectNulls
        valueFormatter={(v) => formatNumber(v)}
        indexFormatter={roundName}
        xAxisLabel="Round"
        yAxisLabel={campaign.target}
        aria-label={`Best ${campaign.target} by round: ${points.map((p) => `${roundName(p.round)} ${formatNumber(p.best)}`).join(", ")}`}
        customTooltip={(d) => (
          <p className="text-fg-muted">
            Best <span className="text-fg tabular-nums">{formatNumber(typeof d.best === "number" ? d.best : null)}</span>
            {unit ? ` ${unit}` : ""} from {formatNumber(typeof d.runs === "number" ? d.runs : null, "count")} runs
          </p>
        )}
      />
    </ChartFrame>
  );
}
