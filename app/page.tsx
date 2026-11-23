"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArchiveDialog, type ArchiveRequest } from "@/components/home/archive-dialog";
import { ArchivedCampaigns } from "@/components/home/archived-campaigns";
import { CampaignList } from "@/components/home/campaign-list";
import { DemoCampaignPreview } from "@/components/home/demo-preview";
import { HowItWorks, WhatKalosNeeds } from "@/components/home/how-it-works";
import { NewCampaignForm } from "@/components/home/new-campaign-form";
import { RenameDialog } from "@/components/home/rename-dialog";
import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { ErrorState } from "@/components/ui/honest-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaigns } from "@/hooks/use-engine";
import type { CampaignMeta, CampaignSummaryRow } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";
import { formatValue } from "@/lib/num";
import { sortCampaigns } from "@/lib/home";
import { ToolFinder } from "@/components/shell/tool-finder";

/**
 * Campaigns home. The engine's campaign list decides what shows: while it
 * loads, a skeleton; if it fails, a connection problem (never "no
 * campaigns"); with zero campaigns, the first-run explanation and one action;
 * otherwise every campaign with the engine's summary fields (one list request,
 * never one per campaign), a form for a new one, and the archived campaigns
 * one click down.
 * `?new=1` (the sidebar's "New campaign") focuses the name field.
 */
export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home />
    </Suspense>
  );
}

function Home() {
  const wantsNew = useSearchParams().get("new") === "1";
  const campaigns = useCampaigns();

  if (campaigns.status === "loading") return <HomeSkeleton />;
  if (campaigns.status === "error" || !campaigns.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Campaigns" />
        <ErrorState
          description="The campaign list did not load because the analysis service did not answer. This is a connection problem, not an empty workspace: your campaigns are unaffected."
          onRetry={() => void campaigns.refresh()}
          busy={campaigns.refreshing}
        />
      </div>
    );
  }
  if (campaigns.data.length === 0) return <FirstRun autoFocus={wantsNew} />;
  return <CampaignsOverview list={campaigns.data} stale={campaigns.error} autoFocus={wantsNew} />;
}

function FirstRun({ autoFocus }: { autoFocus: boolean }) {
  const archive = useArchiveFlow();
  return (
    <div className="flex flex-col gap-14 py-4 md:py-8">
      <section aria-labelledby="hero-title" className="flex max-w-[44rem] flex-col gap-5">
        <p className="text-label text-accent">Bioprocess experiment design</p>
        <h1 id="hero-title" className="text-display text-fg">
          Choose your next experiments from the runs you already have.
        </h1>
        <p className="text-body text-fg-muted">
          Kalos fits a Bayesian model to your prior runs and proposes the next batch to try, each prediction with its interval. It tells you plainly
          when the model is not yet reliable. You run the batch in your own lab, and each measured result feeds the next round&apos;s model.
        </p>
        <NewCampaignForm autoFocus={autoFocus} label="Name your first campaign" className="mt-2" />
      </section>
      <HowItWorks />
      <WhatKalosNeeds />
      {DEMO_MODE ? <DemoCampaignPreview /> : null}
      <Disclosure summary="Archived campaigns" className="border-b">
        <ArchivedCampaigns version={archive.version} onUnarchive={(c) => archive.ask(c, "unarchive")} />
      </Disclosure>
      {archive.dialog}
    </div>
  );
}

/** One archive / unarchive confirmation for the page; after either, the campaign list and the archived list reload. */
function useArchiveFlow() {
  const campaigns = useCampaigns();
  const [request, setRequest] = useState<ArchiveRequest | null>(null);
  const [version, setVersion] = useState(0);
  const dialog = (
    <ArchiveDialog
      request={request}
      onOpenChange={(open) => !open && setRequest(null)}
      onDone={() => {
        setVersion((n) => n + 1);
        void campaigns.refresh();
      }}
    />
  );
  return { version, dialog, ask: (c: Pick<CampaignMeta, "id" | "name">, action: ArchiveRequest["action"]) => setRequest({ campaign: c, action }) };
}

function CampaignsOverview({ list, stale, autoFocus }: { list: CampaignSummaryRow[]; stale: boolean; autoFocus: boolean }) {
  const campaigns = useCampaigns();
  const archive = useArchiveFlow();
  const [renaming, setRenaming] = useState<CampaignMeta | null>(null);
  const sorted = sortCampaigns(list);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Campaigns"
        description="Each campaign improves one target, round by round: harmonize the runs you have, predict the next batch, validate it in your lab."
      />
      <ToolFinder />
      <section aria-labelledby="new-title" className="flex flex-col gap-2">
        <h2 id="new-title" className="text-heading text-fg">
          New campaign
        </h2>
        <NewCampaignForm autoFocus={autoFocus} />
      </section>
      <section aria-labelledby="list-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="list-title" className="text-heading text-fg">
            Your campaigns{" "}
            <span className="text-fg-muted tabular-nums">
              {campaigns.more ? `showing ${formatValue(sorted.length, { quantity: "count" }).text} of more` : formatValue(sorted.length, { quantity: "count" }).text}
            </span>
          </h2>
          <p className="text-caption text-fg-muted">
            {stale ? "Could not refresh the list just now (connection problem); showing the last answer." : "Most recently updated first."}
            {campaigns.more ? " The engine has more campaigns than this page reads; the rest are not listed here." : ""}
          </p>
        </div>
        <CampaignList campaigns={sorted} onRename={setRenaming} onArchive={(c) => archive.ask(c, "archive")} />
      </section>
      <div>
        <Disclosure summary="Archived campaigns">
          <ArchivedCampaigns version={archive.version} onUnarchive={(c) => archive.ask(c, "unarchive")} />
        </Disclosure>
        <Disclosure summary="How a campaign runs" className="border-b">
          <HowItWorks className="pt-2" titled={false} />
        </Disclosure>
      </div>
      {archive.dialog}
      <RenameDialog campaign={renaming} onOpenChange={(open) => !open && setRenaming(null)} onRenamed={() => void campaigns.refresh()} />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading campaigns">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-9 w-[28rem] max-w-full" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
