"use client";

import { ChartFrame } from "@/components/kit/chart-frame";
import { LineChart } from "@/components/tremor/line-chart";
import { formatNumber } from "@/lib/format";
import { bestSoFarSeries } from "@/lib/overview";
import type { ActiveCampaign } from "@/lib/workbench";

const roundName = (r: string | number) => (Number(r) === 0 ? "Upload" : `Round ${r}`);

/** Measured best-so-far by round, as on the Overview: never a prediction, gaps stay gaps. */
export function BestSoFarChart({ campaign, unit }: { campaign: ActiveCampaign; unit: string }) {
  const series = bestSoFarSeries(campaign);
  const measuredRounds = series.filter((p) => p.best != null).length;
  return (
    <ChartFrame
      title="Best so far, by round"
      unit={unit || undefined}
      n={campaign.n_base}
      method="The highest measured value in the dataset after each round's results were added. Round 0 is the uploaded run sheet. Measured values only, never predictions."
      state={measuredRounds < 2 ? "insufficient" : "ready"}
      insufficientText="The trend appears once a round's results have been added to the model."
    >
      <LineChart
        className="h-64"
        data={series}
        index="round"
        categories={["best"]}
        showLegend={false}
        showDots
        autoMinValue
        connectNulls
        valueFormatter={(v) => formatNumber(v)}
        indexFormatter={roundName}
        xAxisLabel="Round"
        yAxisLabel={campaign.target}
        aria-label={`Best ${campaign.target} by round: ${series.map((p) => `${roundName(p.round)} ${formatNumber(p.best)}`).join(", ")}`}
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
