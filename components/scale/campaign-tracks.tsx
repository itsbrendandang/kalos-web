"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { GateDiamond } from "@/components/viz/charts/stage-gate-track";
import { useCampaigns } from "@/hooks/use-engine";
import { HOME_ROUTE, campaignHref } from "@/lib/routes";
import { decisionWord, recordedAt } from "@/lib/viz-data/stage-gate";

/**
 * Every campaign's scale-up track, one line each: the current stage a person
 * recorded and the latest gate decision, from the one summary list request.
 * Gates are recorded per campaign, on the campaign's own Scale-up track page.
 */
export function CampaignTracks() {
  const campaigns = useCampaigns();
  if (campaigns.status === "loading") return <LoadingSkeleton rows={3} label="Loading campaigns" />;
  if (campaigns.status === "error" && !campaigns.data) {
    return <ErrorState description="The campaign list did not load. This is a connection problem, not a result." onRetry={() => void campaigns.refresh()} busy={campaigns.refreshing} />;
  }
  const list = (campaigns.data ?? []).filter((c) => !c.archived).slice().sort((a, b) => b.updated_at - a.updated_at);
  if (list.length === 0) {
    return (
      <p className="text-body text-fg-muted">
        No campaigns yet. Stage tracks and gate decisions live inside a campaign:{" "}
        <Link href={HOME_ROUTE.href} className="text-accent underline-offset-4 hover:underline">
          create one on Campaigns
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
      {list.map((c) => {
        const g = c.latest_gate_decision ?? null;
        return (
          <li key={c.id}>
            <Link href={campaignHref(c.id, "scale-up")} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-subtle">
              <span className="min-w-0 flex-1 truncate text-label text-fg">{c.name}</span>
              <span className="text-caption text-fg-muted">{c.current_stage ? `Current stage ${c.current_stage}` : "No current stage recorded"}</span>
              <span className="inline-flex items-center gap-1.5 text-caption text-fg-muted">
                <GateDiamond recorded={g != null} size={11} />
                {g ? `Gate ${g.gate}: ${decisionWord(g.decision)} · ${recordedAt(g.decided_at).slice(0, 10)}` : "No gate decision recorded"}
              </span>
              <ArrowRight className="size-4 shrink-0 text-fg-muted" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
