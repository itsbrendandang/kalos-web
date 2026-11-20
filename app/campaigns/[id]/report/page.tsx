"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Callout } from "@/components/kit/callout";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { SourceLine, formatTimestamp, shortHash } from "@/components/kit/source-line";
import { Downloads } from "@/components/report/downloads";
import { HistorySectionView } from "@/components/report/history";
import { OperatingRangesSection } from "@/components/report/operating-ranges";
import { RawDataSection } from "@/components/report/raw-data";
import { asExtra, readFullHistory, readRowsExtra, useGates, useResultHistory, useRowsExport, useSetup } from "@/components/report/report-data";
import { NotInPackage, PackageContents } from "@/components/report/package-lists";
import { ProvenanceBlock } from "@/components/report/provenance-block";
import { BatchSection, EvidenceSection, ModelSection, ObjectiveSection } from "@/components/report/report-summary";
import { RunsTable } from "@/components/report/runs-table";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaignDetail, useCampaignId, useLatest } from "@/hooks/use-engine";
import type { CampaignDetail, PopulatedResult } from "@/lib/api";
import { formatValue } from "@/lib/num";
import { buildPackage, type OperatingRangesRun, type PackageAnalysis, type PackageExtras } from "@/lib/report-package";
import { campaignHref } from "@/lib/routes";

const TITLE = "Report and export";
const count = (n: number) => formatValue(n, { quantity: "count" }).text;
const DESCRIPTION =
  "A data package assembled in your browser from what the engine returned for this campaign: its summary, current analysis, runs, result history, raw data and scale-up decisions. Nothing is recomputed.";

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
  const rows = useRowsExport(meta.id);
  const gates = useGates(meta.id);
  const setup = useSetup(meta.id);
  const history = useResultHistory(meta.id);
  const [ranges, setRanges] = useState<OperatingRangesRun | null>(null);

  const extras: PackageExtras = useMemo(() => {
    const h = history.state;
    return {
      rows: asExtra(rows),
      gates: asExtra(gates),
      setup: asExtra(setup),
      operatingRanges: ranges,
      history:
        h.status === "loading"
          ? undefined
          : h.status === "unavailable"
            ? { status: "unavailable", code: h.code, reason: h.reason }
            : { status: "loaded", results: h.results.items, audit: h.audit.items, notes: h.notes, complete: !h.results.hasMore && !h.audit.hasMore, pages: 1 },
    };
  }, [rows, gates, setup, ranges, history.state]);

  // The on-screen package is stamped when this data arrived; each download builds a fresh one.
  const [shownAt] = useState(() => Date.now());
  const pkg = useMemo(() => buildPackage(meta, summary, a, shownAt, extras), [meta, summary, a, shownAt, extras]);
  const build = useCallback(() => buildPackage(meta, summary, a, new Date(), extras), [meta, summary, a, extras]);
  // A package download is a user action, so it reads what the page reads only on demand: the full history and,
  // unless already read, the raw-rows export (counts and attribution).
  const buildFull = useCallback(async () => {
    const [full, rowsExtra] = await Promise.all([readFullHistory(meta.id), extras.rows ?? readRowsExtra(meta.id)]);
    return buildPackage(meta, summary, a, new Date(), { ...extras, history: full, rows: rowsExtra });
  }, [meta, summary, a, extras]);
  const measured = pkg.runs.filter((r) => r.status === "measured").length;
  const unit = pkg.objective.unit;

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
          Runs were started or recorded after the engine last fitted the model. The model and the proposed batch below describe that fit; the evidence,
          the runs table and the result history are current. Re-analyze on Validate to bring them together.
        </Callout>
      ) : null}

      <Section id="downloads" title="Downloads" className="print:hidden">
        <Downloads pkg={pkg} build={build} buildFull={buildFull} campaignName={meta.name} generatedAt={shownAt} />
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
        {pkg.runs.length ? <RunsTable runs={pkg.runs} unit={unit} ranges={pkg.data.observed_design_space.ranges} /> : null}
      </Section>

      <HistorySectionView state={history.state} unit={unit} onRetry={history.reload} onLoadOlder={(w) => void history.loadOlder(w)} />

      <RawDataSection campaignId={meta.id} campaignName={meta.name} read={rows} />

      <OperatingRangesSection
        campaignId={meta.id}
        target={pkg.objective.target}
        unit={unit}
        goal={pkg.objective.direction}
        bestMeasured={pkg.evidence.best_measured}
        inSync={pkg.campaign.analysis_in_sync}
        last={ranges}
        onResult={setRanges}
      />

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
