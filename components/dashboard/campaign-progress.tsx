"use client";

import { campaignComparisons, type Campaign } from "@/lib/api";
import { ProgressChart } from "@/components/charts";
import { Card } from "@/components/ui/card";
import { num, parseUnit } from "@/lib/utils";

export function CampaignProgress({ campaign }: { campaign: Extract<Campaign, { has_campaign: true }> }) {
  const comparisons = campaignComparisons(campaign);
  const current = campaign.history.find((h) => h.round === campaign.round);
  const unit = parseUnit(campaign.target);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-fg">Best {campaign.target} so far</h2>
          <p className="text-[11px] text-muted">Measured, over {campaign.history.length} recorded rounds. Missing measurements remain gaps.</p>
        </div>
        <span className="tabular font-mono text-[20px] font-semibold text-fg">{current?.best == null ? "n/a" : num(current.best, 2)}</span>
      </div>
      {campaign.analysis_in_sync !== undefined ? (
        <p className="text-[12px] text-muted">{campaign.analysis_in_sync ? "Engine status: analysis is in sync with this campaign." : "Engine status: analysis is out of sync with this campaign; re-analyze to update it."}</p>
      ) : null}
      {campaign.history.length >= 2 ? <div className="h-[110px] w-full"><ProgressChart data={campaign.history} /></div> : null}
      {comparisons.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {comparisons.map((c) => (
            <div key={c.comparison_type} className="rounded-[10px] border border-border p-3 text-[12px] text-muted">
              <h3 className="font-semibold text-fg">{c.comparison_type === "initial" ? "Initial to current" : "Previous to current"} · round {c.baseline_round} → {c.current_round}</h3>
              <p className="mt-1">{c.baseline_best == null ? "n/a" : num(c.baseline_best, 2)} → {c.current_best == null ? "n/a" : num(c.current_best, 2)}{unit ? ` ${unit}` : ""} · {c.n_runs_added} runs added</p>
              <p className="mt-1">
                {c.improvement == null
                  ? "Change unavailable — a compared round has no measured best."
                  : `Measured change: ${c.improvement >= 0 ? "+" : "−"}${num(Math.abs(c.improvement), 2)}${c.baseline_best! > 0 ? "%" : unit ? ` ${unit}` : " (absolute)"}${c.improvement === 0 ? " · plateau" : ""}`}
              </p>
              {c.baseline_best != null && c.baseline_best <= 0 ? <p>Absolute change shown because the baseline is zero or negative.</p> : null}
            </div>
          ))}
        </div>
      ) : <p className="text-[12px] text-muted">Round comparisons unavailable — need a current and earlier history entry.</p>}
      <p className="text-[11px] text-muted">Observed changes within this campaign; statistical significance and attribution to optimization are not established.</p>
    </Card>
  );
}
