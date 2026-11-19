"use client";

import { useMemo } from "react";
import { ProgressChart } from "@/components/viz/charts/progress-chart";
import { useOptionalCampaignData } from "@/hooks/use-engine";
import { sourceFromAnalysis, sourceFromCampaign } from "@/lib/source";
import { toProgressData, type ProgressAnalysis, type ProgressCampaign } from "@/lib/viz-data/progress-chart";

/**
 * Compatibility entry point for the C1 ProgressChart (VIZ_SPEC 5): the
 * Overview and Validate both render it through this name. `analysis` is
 * optional; inside a campaign the current analysis is read from the
 * campaign's data provider, so each started run's band (and the next batch)
 * come from the same engine response the rest of the page shows. `unit` is
 * accepted for older callers; the unit is parsed from the target header.
 */
export function BestSoFarChart({
  campaign,
  analysis,
  className,
  title,
  bare,
}: {
  campaign: ProgressCampaign;
  analysis?: ProgressAnalysis | null;
  /** Deprecated: the unit comes from the target header (lib/num parseUnit). */
  unit?: string;
  className?: string;
  title?: string;
  bare?: boolean;
}) {
  const ctx = useOptionalCampaignData();
  const latest = ctx?.latest.data;
  const a: ProgressAnalysis | null = analysis !== undefined ? analysis : latest && latest.has_data ? latest : null;
  const data = useMemo(() => toProgressData(campaign, a), [campaign, a]);
  const source = a ? sourceFromAnalysis(a, "campaign.history[].best", "measured", "held-out conformal band") : sourceFromCampaign("campaign.history[].best", "measured");
  return <ProgressChart data={data} source={source} className={className} title={title} bare={bare} />;
}
