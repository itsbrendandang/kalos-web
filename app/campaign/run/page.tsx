"use client";

import Link from "next/link";
import { RecipeActions } from "@/components/campaign/recipe-actions";
import { RunsTable } from "@/components/campaign/runs-table";
import { PageHeader } from "@/components/kit/page-header";
import { Term } from "@/components/kit/term";
import { Verdict } from "@/components/kit/verdict";
import { buttonVariants } from "@/components/ui/button";
import { ExampleBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { displayRound } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";

import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { recipeColumns, recipesAsText, runLabels } from "@/lib/recipe-identity";
import { runVerdict } from "@/lib/run-stage";
import { campaignView } from "@/lib/workbench";

/** Run: this round's runs and what is still out. Read-only; results are entered on Record. */
export default function RunPage() {
  const campaign = useCampaign();
  const latest = useLatest();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const active = view.state === "data" ? view.campaign : null;
  const demo = view.state === "data" && view.demo;
  const analysis = !demo && latest.data?.has_data ? latest.data : null;
  const awaiting = active?.pending.filter((r) => r.awaiting).length ?? 0;
  // The band is the analysis' conformal half-width; without one the table shows the prediction alone.
  const band = analysis?.conformal_q != null ? { halfWidth: analysis.conformal_q, coverage: analysis.conformal_coverage } : null;
  // The same recipe identity as on Plan: P1..Pn by start order, every input as a column in the sheet's order.
  const pending = active?.pending ?? [];
  const columns = recipeColumns(pending.map((r) => r.recipe), analysis?.features ?? active?.features ?? [], active?.features ?? []);
  const labels = runLabels(pending);
  const target = analysis?.target ?? active?.target ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={active ? `Round ${displayRound(active.round)}` : undefined}
        title="Runs in the lab"
        meta={demo ? <ExampleBadge /> : null}
        description={
          <>
            This <Term word="round">round</Term>&apos;s runs, their <Term word="recipe">recipes</Term> and what <Term word="model">the model</Term> expects of them. Results are entered on Record.
          </>
        }
        action={
          awaiting > 0 ? (
            <Link href="/campaign/record" className={buttonVariants()}>
              Record results
            </Link>
          ) : null
        }
      />
      {view.state === "error" ? (
        <ErrorState onRetry={() => void campaign.refresh()} busy={campaign.refreshing} />
      ) : view.state === "loading" ? (
        <LoadingSkeleton variant="table" rows={4} />
      ) : !active || active.pending.length === 0 ? (
        <EmptyState
          title="No runs started this round"
          description="Start runs from the Plan stage."
          action={
            <Link href="/campaign/plan" className={buttonVariants({ variant: "outline" })}>
              Go to Plan
            </Link>
          }
        />
      ) : (
        <>
          <Verdict tone={awaiting > 0 ? "neutral" : "good"}>{runVerdict(active.pending, awaiting, analysis?.target ?? active.target, band)}</Verdict>
          <RecipeActions
            text={recipesAsText(
              pending.map((r) => ({ label: labels.get(r.id) ?? r.id, recipe: r.recipe, predicted: r.pred, measured: r.result })),
              columns,
              target,
              { measured: true, round: displayRound(active.round) },
            )}
          />
          <RunsTable runs={pending} columns={columns} labels={labels} band={band} />
        </>
      )}
    </div>
  );
}
