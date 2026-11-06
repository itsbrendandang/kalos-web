"use client";

// One recorded round of the campaign: the runs the engine still lists for it, with the recipe, the prediction
// (and its band from the analysis), the measurement and the status. The engine does not keep the runs of a
// round once it folds them into the campaign's data, so a folded round says so instead of reconstructing rows.

import Link from "next/link";
import { useParams } from "next/navigation";
import { Archive, Inbox } from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Verdict } from "@/components/kit/verdict";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { WhyLine } from "@/components/kit/why-line";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { roundState, roundVerdict, runsOfRound } from "@/components/data/rows";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { displayRound } from "@/lib/campaign-stage";
import { formatBand, formatNumber } from "@/lib/format";
import { shortId } from "@/lib/workbench";

export default function DataRoundPage() {
  const params = useParams<{ round: string }>();
  const round = /^\d+$/.test(params.round) ? Number(params.round) : NaN;
  const campaign = useCampaign();
  const latest = useLatest();
  const analysis = latest.data?.has_data ? latest.data : null;
  const c = campaign.data?.has_campaign ? campaign.data : null;

  if (!Number.isInteger(round) || round < 1) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Data" title="Round" description="Rounds are numbered from 1." />
        <EmptyState icon={Inbox} title="No such round" description="The address does not name a round. Rounds are counted from 1 in the order they were started." action={<BackToData />} />
      </div>
    );
  }

  const title = `Round ${formatNumber(round, "count")}`;

  if (campaign.status === "error") {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Data" title={title} />
        <ErrorState
          title="Could not reach Kalos"
          description="This is a connection problem, not an empty round. The round will show once Kalos answers."
          onRetry={() => void campaign.refresh()}
          busy={campaign.refreshing}
        />
      </div>
    );
  }
  if (!campaign.data) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Data" title={title} description="Reading the campaign." />
        <LoadingSkeleton rows={4} label="Loading the round" />
      </div>
    );
  }
  if (!c) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Data" title={title} />
        <EmptyState icon={Inbox} title="No campaign yet" description="Rounds are recorded once Kalos has read a run sheet and runs are started from it." action={<BackToData />} />
      </div>
    );
  }

  const runs = runsOfRound(c.pending, c.round, round);
  const state = roundState(runs, c.history, round);
  const dataset = analysis?.dataset ?? null;
  const from = dataset ? `Started from ${dataset}.` : "Started from the campaign's run sheet.";

  if (state === "folded") {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Data" title={title} description={`Now part of the runs the model learns from. ${from}`} />
        <EmptyState
          icon={Archive}
          title={`Round ${formatNumber(round, "count")} is now part of the runs the model learns from, so Kalos no longer lists its runs on their own`}
          description="Its measured runs now count among the campaign's runs. Kalos does not send those runs back one by one, so this page cannot list them."
          action={<BackToData />}
        />
      </div>
    );
  }
  if (state === "unknown") {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Data" title={title} description={from} />
        <EmptyState
          icon={Inbox}
          title={`Round ${formatNumber(round, "count")} has not been recorded`}
          description={
            displayRound(c.round) === round
              ? "The campaign is at this round and no runs have been started for it yet. Start runs from Plan and they appear here."
              : `The campaign is at round ${formatNumber(displayRound(c.round), "count")} and Kalos lists no runs for this one.`
          }
          action={<BackToData />}
        />
      </div>
    );
  }

  const measured = runs.filter((r) => r.result != null).length;
  const awaiting = runs.filter((r) => r.awaiting).length;
  const inputs = c.features.filter((f) => runs.some((r) => f in r.recipe));
  const band = analysis?.conformal_q != null && analysis.run?.input_sha256 ? { halfWidth: analysis.conformal_q, coverage: analysis.conformal_coverage } : null;
  const sheetBest = c.history.find((h) => h.round === 0)?.best ?? null;
  const origin = `Round ${formatNumber(round, "count")}`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Data"
        title={title}
        description={`${formatNumber(measured, "count")} ${measured === 1 ? "run" : "runs"} measured, ${formatNumber(awaiting, "count")} waiting for a result. ${from}`}
        action={
          <Link href="/campaign/record" className={buttonVariants({ variant: "outline" })}>
            Record results
          </Link>
        }
      />

      <Verdict tone="neutral">{roundVerdict(runs, sheetBest, (v) => formatNumber(v))}</Verdict>

      <Section title="Runs" description="Each run's recipe as Kalos proposed it, the predicted value, and the measured value once recorded.">
        <Table containerClassName="max-h-[600px] rounded-xl border border-border" className="bg-surface">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-surface">Run</TableHead>
              {inputs.map((f) => (
                <TableHead key={f} numeric className="bg-surface">
                  <span className="font-mono text-code">{f}</span>
                </TableHead>
              ))}
              <TableHead numeric className="bg-surface">
                Predicted
              </TableHead>
              <TableHead numeric className="bg-surface">
                Measured
              </TableHead>
              <TableHead className="bg-surface">Status</TableHead>
              <TableHead className="bg-surface">From</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-code">{shortId(r.id)}</TableCell>
                {inputs.map((f) => (
                  <TableCell key={f} numeric>
                    {formatNumber(r.recipe[f])}
                  </TableCell>
                ))}
                <TableCell numeric>
                  {formatNumber(r.pred)}
                  {band ? <span className="ml-2 text-caption text-fg-muted">{formatBand(band.halfWidth)}</span> : null}
                </TableCell>
                <TableCell numeric className={r.result == null ? "text-fg-muted" : undefined}>
                  {r.result == null ? "not yet" : formatNumber(r.result)}
                </TableCell>
                <TableCell>
                  <Badge tone={r.awaiting ? "warn" : "good"}>{r.awaiting ? "Waiting for a result" : "Measured"}</Badge>
                </TableCell>
                <TableCell>
                  <Badge tone="neutral">{origin}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Disclosure summary="Where this is kept">
        <p className="text-body text-fg-muted">
          These runs come from Kalos, which keeps the campaign&apos;s runs until the model is next updated and they become part of the runs it learns from. Predictions
          are the model&apos;s at the time the round was started; the ± beside each is the likely range (the conformal band of that analysis).
        </p>
        {band ? <WhyLine code="coverage_not_guaranteed" /> : null}
      </Disclosure>
    </div>
  );
}

function BackToData() {
  return (
    <Link href="/data" className={buttonVariants({ variant: "outline" })}>
      Back to Data
    </Link>
  );
}
