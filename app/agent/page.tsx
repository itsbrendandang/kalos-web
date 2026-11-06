"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { Metric } from "@/components/kit/metric";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { ExampleBadge, ModeBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { agentStatus, awaitingRuns, forecastCheck, measuredRuns } from "@/lib/agent";
import { DEMO_MODE } from "@/lib/demo";
import { formatBand, formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { campaignView, shortId, type ActiveCampaign } from "@/lib/workbench";
import { cn } from "@/lib/utils";

const POLL_MS = 20_000;

/**
 * Agent: what is in the lab right now, and how the model's forecasts held up
 * against the results that came back. Everything comes from the engine's
 * campaign; the page checks again on its own while runs are out.
 */
export default function AgentPage() {
  const campaign = useCampaign();
  const latest = useLatest();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const c = view.state === "data" ? view.campaign : null;
  const demo = view.state === "data" && view.demo;
  const status = agentStatus(c);
  const analysis = !demo && latest.data?.has_data ? latest.data : null;
  // The band is the analysis' conformal half-width; without one a run shows its forecast alone.
  const band = analysis?.conformal_q != null ? { halfWidth: analysis.conformal_q, coverage: analysis.conformal_coverage } : null;

  // Check again while runs are in flight (real data only; never poll example data).
  const { refresh } = campaign;
  const waiting = status.state === "waiting" && !demo;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [waiting, refresh]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={view.state === "data" ? status.headline : "Agent"}
        meta={demo ? <ExampleBadge /> : null}
        description={view.state === "data" ? status.detail : "What is in the lab, and how the model's forecasts held up once results came back."}
        action={
          view.state === "data" ? (
            <>
              <Button variant="ghost" onClick={() => void campaign.refresh()} disabled={campaign.refreshing}>
                <RefreshCw className={cn(campaign.refreshing && "animate-spin")} />
                {campaign.refreshing ? "Checking" : "Check now"}
              </Button>
              {status.state === "waiting" ? (
                <Link href="/campaign/record" className={buttonVariants()}>
                  Record results
                </Link>
              ) : null}
            </>
          ) : null
        }
      />

      {view.state === "error" ? (
        <ErrorState title="Could not reach the engine" description="This is a connection problem, not an idle lab." onRetry={() => void campaign.refresh()} busy={campaign.refreshing} />
      ) : view.state === "loading" ? (
        <LoadingSkeleton rows={4} label="Loading the campaign" />
      ) : (
        <>
          <InTheLab c={c} band={band} />
          <Forecasts c={c} />
        </>
      )}

      <p className="text-body text-fg-muted">
        To watch the method on a known problem,{" "}
        <Link href="/library/simulator" className="text-accent underline-offset-4 hover:underline">
          run the benchmark in the Library
        </Link>
        .
      </p>
    </div>
  );
}

function InTheLab({ c, band }: { c: ActiveCampaign | null; band: { halfWidth: number; coverage?: number } | null }) {
  const runs = c ? awaitingRuns(c) : [];
  return (
    <Section title="In the lab" description={runs.length ? `${formatNumber(runs.length, "count")} ${runs.length === 1 ? "run" : "runs"} started and not yet recorded.` : undefined}>
      {runs.length === 0 ? (
        <EmptyState
          title="Nothing is in the lab"
          description={c ? "Start the next batch from Plan and the runs appear here." : "Upload a run sheet in Setup to begin."}
          action={
            <Link href={c ? "/campaign/plan" : "/campaign/setup"} className={buttonVariants({ variant: "outline" })}>
              {c ? "Go to Plan" : "Go to Setup"}
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
              <span className="w-16 font-mono text-code text-fg">{shortId(r.id)}</span>
              <dl className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1 text-caption">
                {Object.entries(r.recipe).map(([k, v]) => (
                  <div key={k} className="flex gap-1.5">
                    <dt className="font-mono text-code text-fg-muted">{k}</dt>
                    <dd className="tabular-nums text-fg">{formatNumber(v)}</dd>
                  </div>
                ))}
              </dl>
              <span className="text-body tabular-nums text-fg">
                {formatNumber(r.pred)}
                {band ? <span className="ml-1.5 text-caption text-fg-muted">{formatBand(band.halfWidth, band.coverage)}</span> : null}
              </span>
              <ModeBadge mode={r.mode} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Forecasts({ c }: { c: ActiveCampaign | null }) {
  const runs = c ? measuredRuns(c) : [];
  const check = forecastCheck(runs);
  return (
    <Section title="How the forecasts held up" description="For runs that came back this round, the model's forecast next to the measured result.">
      {!check ? (
        <p className="text-body text-fg-muted">No results are in yet, so there is nothing to compare. Once results are recorded, this fills in.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <Metric label="Results compared" value={check.n} quantity="count" />
            <Metric label="Average miss" value={check.meanAbsError} qualifier="how far the forecast was from the result" />
            <Metric label="Inside the forecast's range" value={`${formatNumber(check.withinOneSd, "count")} of ${formatNumber(check.n, "count")}`} qualifier="within one standard deviation" />
          </div>
          <Disclosure summary="The runs compared" meta={`${formatNumber(check.n, "count")} ${check.n === 1 ? "run" : "runs"}`}>
            <ul className="divide-y divide-border">
              {runs.map((r) => {
                const miss = (r.result as number) - r.pred;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2.5 text-body">
                    <span className="w-16 font-mono text-code text-fg">{shortId(r.id)}</span>
                    <span className="tabular-nums text-fg-muted">forecast {formatNumber(r.pred)}</span>
                    <span className="tabular-nums text-fg">measured {formatNumber(r.result)}</span>
                    <span className="ml-auto tabular-nums text-fg-muted">{formatNumber(miss, "value", { sign: true })}</span>
                  </li>
                );
              })}
            </ul>
          </Disclosure>
        </div>
      )}
    </Section>
  );
}
