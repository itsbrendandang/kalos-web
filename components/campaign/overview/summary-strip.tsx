"use client";

import { useSyncExternalStore } from "react";
import type { CampaignOverview } from "@/lib/campaign-overview";
import { formatOverviewTimestamp, overviewDetails } from "@/lib/campaign-overview";
import { formatNumber } from "@/lib/format";

const subscribeNoop = () => () => {};

function LocalTime({ epoch }: { epoch: number | null }) {
  const zone = useSyncExternalStore(subscribeNoop, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
  if (epoch == null) return null;
  const ms = epoch < 1e12 ? epoch * 1000 : epoch;
  return <time dateTime={new Date(ms).toISOString()}> {formatOverviewTimestamp(epoch, zone)}</time>;
}

function quiet(label: string): string {
  return label.length === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

function countPart(count: number | null, word: string): string {
  return count == null ? `— ${word}` : `${formatNumber(count, "count")} ${word}`;
}

/**
 * One measured number, one baseline line, four status facts, and a single
 * Details disclosure. Unknown counts stay an em dash.
 */
export function SummaryStrip({ model }: { model: CampaignOverview }) {
  const best = model.bestMeasured.value;
  const unit = model.objective.unit;
  const round = model.round.display == null ? "Round" : `Round ${model.round.display}`;
  const promotion =
    model.promotion.verdict === "eligible" ? "eligible" : model.promotion.verdict === "not-eligible" ? "not eligible" : "not evaluated";
  return (
    <section aria-label="Measured summary" className="mt-8">
      <p className="text-caption text-overview-fg-muted">Best measured</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-overview-focal tabular-nums">{best == null ? "—" : formatNumber(best)}</span>
        {best != null && unit ? <span className="text-body text-overview-fg-muted">{unit}</span> : null}
      </p>
      <p className="mt-2 text-caption text-overview-fg-muted">Measured · replicates unknown</p>
      <p className="mt-3 text-body text-overview-fg-muted">Baseline — · no control named</p>
      <ul aria-label="Campaign status" className="mt-12 list-none p-0">
        <li className="py-0.5 text-body">
          <span className="text-overview-fg-muted">{round}</span> · {countPart(model.round.completed, "done")} · {countPart(model.round.pending, "pending")}
        </li>
        <li className="py-0.5 text-body">
          <span className="text-overview-fg-muted">Ranking</span> · {quiet(model.ranking.label)}
        </li>
        <li className="py-0.5 text-body">
          <span className="text-overview-fg-muted">Promotion</span> · {promotion}
        </li>
        <li className="py-0.5 text-body">
          <span className="text-overview-fg-muted">Start</span> · {quiet(model.start.label)}
        </li>
      </ul>
      <details className="mt-3">
        <summary className="inline-flex min-h-8 cursor-pointer items-center text-caption text-overview-fg-muted">Details</summary>
        <p className="mt-2 max-w-[640px] text-caption text-overview-fg-muted">
          {overviewDetails(model)}
          <LocalTime epoch={model.versions.updatedAt} />
        </p>
      </details>
    </section>
  );
}
