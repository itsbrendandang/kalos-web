"use client";

import { CircleCheck, LoaderCircle, Unplug } from "lucide-react";
import { ExampleBadge } from "@/components/ui/badge";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { DEMO_MODE } from "@/lib/demo";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { campaignView } from "@/lib/workbench";
import { cn } from "@/lib/utils";

const ICON = "size-4 shrink-0";

/**
 * The engine connection, always visible in the top bar (it replaced the old
 * status bar). States only what the fetches returned: loading says so, a
 * failed request offers a retry and is never shown as an empty campaign, and
 * demo data carries its badge.
 */
export function EngineStatus({ className }: { className?: string }) {
  const latest = useLatest();
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const failed = view.state === "error" || latest.status === "error";
  const loading = !failed && (view.state === "loading" || latest.status === "loading");
  const demo = view.state === "data" && view.demo;
  const busy = campaign.refreshing || latest.refreshing;

  const said = failed ? "Engine not reachable." : loading ? "Connecting to the engine." : "Engine connected.";
  return (
    <div className={cn("flex items-center gap-2 text-label font-normal text-fg-muted", className)}>
      {/* One live sentence for screen readers; the visible labels below repeat it for sighted users only. */}
      <span role="status" className="sr-only">
        {said}
      </span>
      {failed ? (
        <button
          type="button"
          onClick={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
          disabled={busy}
          aria-label={busy ? "Reconnecting to the engine" : "Retry connecting to the engine"}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-fg hover:bg-subtle"
        >
          <Unplug className={cn(ICON, "text-bad")} aria-hidden />
          <span aria-hidden className="max-lg:hidden">
            Engine not reachable.
          </span>
          <span aria-hidden>{busy ? "Reconnecting..." : "Retry"}</span>
        </button>
      ) : loading ? (
        <span aria-hidden className="inline-flex items-center gap-1.5 px-2">
          <LoaderCircle className={cn(ICON, "animate-spin motion-reduce:animate-none")} />
          <span className="max-lg:hidden">Connecting to the engine</span>
        </span>
      ) : (
        <span aria-hidden className="inline-flex items-center gap-1.5 px-2">
          <CircleCheck className={cn(ICON, "text-good")} />
          <span className="max-lg:hidden">Engine connected</span>
        </span>
      )}
      {demo ? <ExampleBadge className="h-5" /> : null}
    </div>
  );
}
