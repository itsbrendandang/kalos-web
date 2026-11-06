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
import { formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { campaignView, shortId, type ActiveCampaign } from "@/lib/workbench";
import { cn } from "@/lib/utils";

const POLL_MS = 20_000;

/**
 * Agent: what is in the lab right now, and how the model's predictions held
 * up against the results that came back. Everything comes from the campaign
 * Kalos holds; the page checks again on its own while runs are out.
 */
export default function AgentPage() {
  const campaign = useCampaign();
  const latest = useLatest();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const c = view.state === "data" ? view.campaign : null;
  const demo = view.state === "data" && view.demo;
  const status = agentStatus(c);
  const analysis = !demo && latest.data?.has_data ? latest.data : null;
  // The likely range is the half-width Kalos reported for predictions; without one a run shows its prediction alone.
  const band = analysis?.conformal_q != null ? { halfWidth: analysis.conformal_q } : null;

  // Check again while runs are in the lab (real data only; never poll example data).
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
        className="max-sm:flex-col"
        title={view.state === "data" ? status.headline : "Agent"}
        meta={demo ? <ExampleBadge /> : null}
        description={view.state === "data" ? status.detail : "What is in the lab, and how the model's predictions held up once results came back."}
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
        <ErrorState description="This is a connection problem, not an idle lab; nothing you entered is lost." onRetry={() => void campaign.refresh()} busy={campaign.refreshing} />
      ) : view.state === "loading" ? (
        <LoadingSkeleton rows={4} label="Loading the campaign" />
      ) : (
        <>
          <InTheLab c={c} band={band} />
          {c && measuredRuns(c).length > 0 ? <Forecasts c={c} /> : null}
        </>
      )}

      <p className="text-body text-fg-muted">
        To watch Kalos search a practice problem with a known answer,{" "}
        <Link href="/library/simulator" className="text-accent underline-offset-4 hover:underline">
          open the benchmark in the Library
        </Link>
        .
      </p>
    </div>
  );
}

function InTheLab({ c, band }: { c: ActiveCampaign | null; band: { halfWidth: number } | null }) {
  const runs = c ? awaitingRuns(c) : [];
  return (
    <Section title="In the lab" description={runs.length ? `${formatNumber(runs.length, "count")} ${runs.length === 1 ? "run" : "runs"} started and not yet recorded.` : undefined}>
      {runs.length === 0 ? (
        <EmptyState
          title="No runs waiting for a result"
          description={c ? "Start the next runs from Plan and they appear here." : "Upload a run sheet in Setup to begin."}
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
                <span className="mr-1.5 text-caption text-fg-muted">Predicted</span>
                {formatNumber(r.pred)}
                {band ? <span className="ml-1.5 text-caption text-fg-muted">likely range ± {formatNumber(band.halfWidth)}</span> : null}
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
    <Section title="How the predictions held up" description="For runs that came back this round, the model's prediction next to the measured result.">
      {!check ? (
        <p className="text-body text-fg-muted">Results are in, but none of them had a prediction to compare against.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <Metric label="Results compared" value={check.n} quantity="count" />
            <Metric label="Average miss" value={check.meanAbsError} qualifier="how far the predicted value was from the measured one" />
            <Metric label="Inside the likely range" value={`${formatNumber(check.withinOneSd, "count")} of ${formatNumber(check.n, "count")}`} qualifier="measured results that landed as close as the model expected" />
          </div>
          <Disclosure summary="The runs compared" meta={`${formatNumber(check.n, "count")} ${check.n === 1 ? "run" : "runs"}`}>
            <ul className="divide-y divide-border">
              {runs.map((r) => {
                const miss = (r.result as number) - r.pred;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2.5 text-body">
                    <span className="w-16 font-mono text-code text-fg">{shortId(r.id)}</span>
                    <span className="tabular-nums text-fg-muted">predicted {formatNumber(r.pred)}</span>
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
