"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CircleCheck, CircleDashed, Crosshair, LoaderCircle, Trophy, Unplug } from "lucide-react";
import { Badge, ExampleBadge } from "@/components/ui/badge";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { campaignStage, displayRound } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { campaignView } from "@/lib/workbench";
import { cn } from "@/lib/utils";

const ICON = "size-3.5 shrink-0";

function Item({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      {icon}
      {children}
    </span>
  );
}

/**
 * The always-present status line: engine connection and the campaign at a
 * glance, then the one next step on the right. It states only what the engine
 * returned: loading says so, a failed request shows a retry (never zeros),
 * demo data is labelled. On phones it keeps the three most important items.
 */
export function StatusBar() {
  const latest = useLatest();
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const failed = view.state === "error" || latest.status === "error";
  const loading = !failed && (view.state === "loading" || latest.status === "loading");
  const c = view.state === "data" ? view.campaign : null;
  const demo = view.state === "data" && view.demo;
  const stage = !failed && !loading && latest.data ? campaignStage(demo ? { has_data: true } : latest.data, c ?? { has_campaign: false }) : null;

  return (
    <footer
      aria-label="Campaign status"
      className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-subtle px-3 text-caption text-fg-muted"
    >
      {failed ? (
        <button
          type="button"
          onClick={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
          disabled={campaign.refreshing || latest.refreshing}
          className="inline-flex items-center gap-1.5 text-fg hover:underline"
        >
          <Unplug className={cn(ICON, "text-bad")} aria-hidden />
          {campaign.refreshing || latest.refreshing ? "Reconnecting..." : "Engine not reachable. Retry"}
        </button>
      ) : loading ? (
        <Item icon={<LoaderCircle className={cn(ICON, "animate-spin")} aria-hidden />}>Connecting to the engine</Item>
      ) : (
        <Item icon={<CircleCheck className={cn(ICON, "text-good")} aria-hidden />}>
          <span className="max-sm:sr-only">Engine connected</span>
        </Item>
      )}
      {demo ? <ExampleBadge className="h-5" /> : null}
      {c ? (
        <>
          <Item icon={<Crosshair className={ICON} aria-hidden />} className="max-lg:hidden">
            {c.target}
          </Item>
          <Item>Round {displayRound(c.round)}</Item>
          <Item icon={<CircleDashed className={ICON} aria-hidden />}>{c.n_awaiting} in flight</Item>
          <Item icon={<CircleCheck className={ICON} aria-hidden />} className="max-md:hidden">
            {c.n_measured} measured
          </Item>
          <Item icon={<Trophy className={ICON} aria-hidden />} className="max-md:hidden">
            Best so far {formatNumber(c.best)}
          </Item>
          {!demo && c.analysis_in_sync === false ? (
            <Badge tone="warn" className="h-5 max-md:hidden">
              Batch out of date
            </Badge>
          ) : null}
        </>
      ) : null}
      {stage ? (
        <Link href={stage.next.href} className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-fg hover:underline">
          {stage.next.action}
          <ArrowRight className={ICON} aria-hidden />
        </Link>
      ) : null}
    </footer>
  );
}
