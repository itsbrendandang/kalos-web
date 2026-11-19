"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Callout } from "@/components/kit/callout";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { SourceLine, formatTimestamp, shortHash } from "@/components/kit/source-line";
import { Downloads } from "@/components/report/downloads";
import { NotInPackage, PackageContents } from "@/components/report/package-lists";
import { ProvenanceBlock } from "@/components/report/provenance-block";
import { BatchSection, EvidenceSection, ModelSection, ObjectiveSection } from "@/components/report/report-summary";
import { RunsTable } from "@/components/report/runs-table";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaignDetail, useCampaignId, useLatest } from "@/hooks/use-engine";
import type { CampaignDetail, PopulatedResult } from "@/lib/api";
import { formatValue, parseUnit } from "@/lib/num";
import { buildPackage, type PackageAnalysis } from "@/lib/report-package";
import { campaignHref } from "@/lib/routes";

const TITLE = "Report and export";
const count = (n: number) => formatValue(n, { quantity: "count" }).text;
const DESCRIPTION =
  "A data package assembled in your browser from what the engine returned for this campaign: its summary, its current analysis and its runs. Nothing is recomputed.";

/**
 * Report: a readable summary and three downloads, every value read from the
 * campaign summary, the current analysis and the campaign meta (see
 * lib/report-package.ts). Measured evidence comes before the model, and the
 * page says plainly what the package cannot contain and why.
 */
export default function ReportPage() {
  const id = useCampaignId();
  const latest = useLatest();
  const detail = useCampaignDetail();

  if (latest.status === "error" || detail.status === "error") {
    return (
      <Page>
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <ErrorState
          description="The engine did not answer, so there is nothing to export yet. This is a connection problem, not a result: your data and runs are unaffected."
          onRetry={() => {
            void latest.refresh();
            void detail.refresh();
          }}
          busy={latest.refreshing || detail.refreshing}
        />
      </Page>
    );
  }
  if (!latest.data || !detail.data) {
    return (
      <Page>
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <LoadingSkeleton rows={6} label="Loading the report" />
      </Page>
    );
  }
  if (!latest.data.has_data) {
    return (
      <Page>
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <EmptyState
          title="Nothing to report yet"
          description="The engine has not analyzed a run sheet for this campaign, so there is no model, batch or provenance to export. Upload your prior runs on Harmonize first."
          action={
            <Link href={campaignHref(id, "harmonize")} className={buttonVariants({ size: "sm" })}>
              Go to Harmonize
            </Link>
          }
        />
      </Page>
    );
  }
  return <Report detail={detail.data} analysis={latest.data} />;
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-10">
      {children}
    </div>
  );
}

function Report({ detail, analysis }: { detail: CampaignDetail; analysis: PopulatedResult }) {
  const { campaign: meta, summary } = detail;
  const a = analysis as PackageAnalysis;
  // The on-screen package is stamped when this data arrived; each download builds a fresh one.
  const [shownAt] = useState(() => Date.now());
  const pkg = useMemo(() => buildPackage(meta, summary, a, shownAt), [meta, summary, a, shownAt]);
  const build = useCallback(() => buildPackage(meta, summary, a, new Date()), [meta, summary, a]);
  const measured = pkg.runs.filter((r) => r.status === "measured").length;

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <SourceLine
          parts={[
            { label: "Campaign", value: meta.name },
            { label: "Dataset", value: pkg.data.dataset },
            { label: "Analysis", value: formatTimestamp(a.updated ?? a.timestamp) },
            { label: "Engine", value: pkg.provenance.engine_version },
            { label: "Provenance", value: shortHash(pkg.provenance.provenance_sha256), title: pkg.provenance.provenance_sha256 ?? undefined },
          ]}
        />
      </div>

      {pkg.campaign.analysis_in_sync === false ? (
        <Callout title="The analysis is older than the latest runs">
          Runs were started or recorded after the engine last fitted the model. The model and the proposed batch below describe that fit; the evidence
          and the runs table are current. Re-analyze on Validate to bring them together.
        </Callout>
      ) : null}

      <Section id="downloads" title="Downloads" className="print:hidden">
        <Downloads pkg={pkg} build={build} campaignName={meta.name} generatedAt={shownAt} />
      </Section>

      <ObjectiveSection pkg={pkg} />
      <EvidenceSection pkg={pkg} />
      <ModelSection pkg={pkg} />
      <BatchSection pkg={pkg} />

      <Section
        id="runs"
        className="min-w-0"
        title="Runs"
        description={
          pkg.runs.length
            ? `${count(pkg.runs.length)} started: ${count(measured)} measured, ${count(pkg.runs.length - measured)} awaiting a result.`
            : "No runs have been started from a proposed batch yet."
        }
      >
        {pkg.runs.length ? (
          <RunsTable runs={pkg.runs} unit={pkg.objective.target ? parseUnit(pkg.objective.target).unit : null} ranges={pkg.data.observed_design_space.ranges} />
        ) : null}
      </Section>

      <div className="grid gap-10 md:grid-cols-2 print:grid-cols-1">
        <Section id="contents" title="What is in this package">
          <PackageContents pkg={pkg} />
        </Section>
        <Section id="not-included" title="Not in this package">
          <NotInPackage pkg={pkg} />
        </Section>
      </div>

      <Section id="provenance" title="Provenance" description="Full values, so this report can be matched to the engine run that produced it.">
        <ProvenanceBlock pkg={pkg} />
      </Section>
    </Page>
  );
}
