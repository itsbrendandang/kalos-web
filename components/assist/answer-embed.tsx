"use client";

import { ScatterFor } from "@/components/campaign/data/your-data";
import { Figure, RunOrderFigure } from "@/components/campaign/data/figures";
import * as meaning from "@/components/campaign/data/meaning";
import { useSheetProfile } from "@/components/campaign/data/use-sheet-profile";
import { DriversList } from "@/components/campaign/drivers-list";
import { ProposedRecipes } from "@/components/campaign/proposed-recipes";
import { LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import type { Embed } from "@/lib/assist-embed";
import { displayRound } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";
import { topDrivers } from "@/lib/overview";
import { useStoredSheet } from "@/lib/sheet-store";

/**
 * The one chart or table an answer carries, drawn by the same components the
 * Data, Learn and Plan pages use. The sheet's charts need the sheet, which
 * this browser holds after an upload; when it does not, the answer says so
 * instead of drawing nothing.
 */
export function AnswerEmbed({ embed }: { embed: Embed }) {
  const latest = useLatest();
  const campaign = useCampaign();
  const analysis = latest.data?.has_data ? latest.data : null;
  const active = campaign.data?.has_campaign ? campaign.data : null;
  const sha = analysis?.run?.input_sha256 ?? null;
  const stored = useStoredSheet(embed.kind === "scatter" || embed.kind === "order" ? sha : null);
  const profile = useSheetProfile(stored.status === "ready" ? stored.file : null, stored.status === "ready" ? (stored.sheet.worksheet ?? undefined) : undefined);

  if (embed.kind === "drivers") {
    if (!analysis) return null;
    const bars = topDrivers(analysis.drivers, 5);
    if (!bars.length) return null;
    return (
      <div className="rounded-2xl border border-border p-4">
        <p className="mb-1 text-label text-fg">What went with higher {analysis.target} in your runs</p>
        <DriversList drivers={bars} targetName={analysis.target} />
      </div>
    );
  }
  if (embed.kind === "recipes") {
    if (!analysis || analysis.proposals.length === 0) return null;
    return (
      <div className="rounded-2xl border border-border p-4">
        <ProposedRecipes analysis={analysis} target={analysis.target} round={active ? displayRound(active.round) : null} compact />
      </div>
    );
  }

  // The sheet's own charts.
  if (!sha || stored.status === "missing") {
    return <p className="text-caption text-fg-muted">This browser does not hold the sheet, so the chart cannot be drawn here. Upload the sheet again on Setup to see it.</p>;
  }
  if (stored.status === "loading" || !profile || profile.status === "loading") return <LoadingSkeleton rows={3} label="Reading the sheet" />;
  if (profile.status === "unreadable") return <p className="text-caption text-fg-muted">The sheet could not be read in this browser, so the chart cannot be drawn here.</p>;
  const cols = profile.profile.columns;
  const y = cols.find((c) => c.name === embed.target);
  if (!y || y.kind !== "numeric") return null;
  if (embed.kind === "scatter") {
    const x = cols.find((c) => c.name === embed.input);
    if (!x) return null;
    return (
      <div className="rounded-2xl border border-border p-4">
        <ScatterFor x={x} y={y} />
      </div>
    );
  }
  const values = y.numbers;
  return (
    <div className="rounded-2xl border border-border p-4">
      <Figure caption={`${y.name} in sheet order, ${formatNumber(y.filled, "count")} runs`} sentence={meaning.sheetOrder(values, [])} note="Sheet order is the order the rows were written. It is not proven to be the order the runs were made.">
        <RunOrderFigure yName={y.name} values={values} />
      </Figure>
    </div>
  );
}
