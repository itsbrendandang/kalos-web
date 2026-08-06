"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlugZap } from "lucide-react";
import { Loading } from "@/components/page-header";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { getNewestCampaignId, type NewestCampaignResult } from "@/lib/workspace/adapter";

/** `/c` resolves to a specific campaign, not a page of its own: it redirects
 *  to the newest one (see lib/workspace/adapter.ts's getNewestCampaignId,
 *  which is honest that "newest" only means anything once a real
 *  multi-campaign engine exists - today it's "the one live campaign, if
 *  any"). With zero campaigns this renders a real empty state instead of
 *  redirecting into a 404. */
export default function CampaignWorkspaceIndexPage() {
  const router = useRouter();
  const [result, setResult] = useState<NewestCampaignResult | { status: "loading" }>({ status: "loading" });

  const applyResult = useCallback(
    (r: NewestCampaignResult) => {
      setResult(r);
      if (r.status === "ok" && r.id) router.replace(`/c/${r.id}`);
    },
    [router],
  );

  // Mount fetch: no synchronous setState here - `result` already starts as
  // { status: "loading" }, so this only needs to apply the resolved value.
  useEffect(() => {
    getNewestCampaignId().then(applyResult);
  }, [applyResult]);

  // Retry button (ServiceUnavailable's onRetry): an event handler, not an
  // effect, so resetting to "loading" before refetching is fine here.
  const retry = useCallback(() => {
    setResult({ status: "loading" });
    getNewestCampaignId().then(applyResult);
  }, [applyResult]);

  if (result.status === "loading" || (result.status === "ok" && result.id)) {
    return (
      <div className="flex h-svh items-center justify-center bg-canvas">
        <Loading label="Finding your campaign" />
      </div>
    );
  }

  if (result.status === "unavailable") {
    return (
      <div className="flex h-svh items-center justify-center bg-canvas p-8">
        <ServiceUnavailable
          onRetry={retry}
          busy={false}
          title="Campaign workspace unavailable"
          body="The dashboard could not reach the kalos engine. Try again in a moment."
        />
      </div>
    );
  }

  return (
    <div className="flex h-svh flex-col items-center justify-center gap-2 bg-canvas p-8 text-center">
      <PlugZap className="size-5 text-muted" />
      <div className="text-[15px] font-semibold text-fg">No campaigns yet</div>
      <p className="max-w-[46ch] text-[13px] leading-5 text-muted">
        Start your first campaign to see it here. Set <code className="font-mono">NEXT_PUBLIC_DEMO_MODE=true</code> to
        preview the workspace with demo campaigns in the meantime.
      </p>
    </div>
  );
}
