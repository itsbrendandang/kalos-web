"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Loading, DemoBadge } from "@/components/page-header";
import { ErrorState } from "@/components/ui/honest-state";
import { Tag } from "@/components/ui/card";
import { ProgressChart } from "@/components/charts";
import { RunQueue, fmtPredicted, type QueueRow } from "@/components/workbench/run-queue";
import { coveragePct, type CampaignRun, type LatestResult, type PopulatedResult } from "@/lib/api";
import { DEMO_BATCH } from "@/lib/mock/campaign";
import { shortId, type ActiveCampaign, type QueueState } from "@/lib/workbench";
import { cn, num } from "@/lib/utils";

/** A panel's title row: a VS Code-style breadcrumb plus optional badge. */
function PanelHead({ crumbs, badge }: { crumbs: string[]; badge?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
      <nav aria-label="Breadcrumb" className="truncate font-mono text-[11px] text-muted">
        {crumbs.map((c, i) => (
          <span key={c}>
            {i > 0 ? <span className="mx-1.5 opacity-60">›</span> : null}
            <span className={i === crumbs.length - 1 ? "text-fg" : undefined}>{c}</span>
          </span>
        ))}
      </nav>
      {badge}
    </div>
  );
}

function DecideLink({ children }: { children: ReactNode }) {
  return (
    <Link href="/campaign/plan" className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline">
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

// Padding on a wrapper, not margin on the alert: the Alert primitive is
// w-full, so a margin on it overflows its column.
export function CampaignError({ onRetry, busy, compact = false }: { onRetry?: () => void; busy?: boolean; compact?: boolean }) {
  return (
    <div className={compact ? "p-2" : "p-4"}>
      <ErrorState
        title="Could not load the campaign"
        description="The request for the campaign failed before the engine could respond. This is a connection problem, not an empty campaign."
        onRetry={onRetry}
        busy={busy}
      />
    </div>
  );
}

/** Real portal proposals (from GET /api/latest) as queue rows. */
function proposalsToQueueRows(d: PopulatedResult): QueueRow[] {
  return d.proposals.map((p, i) => ({
    id: `proposal-${i}`,
    recipe: d.proposal_features.map((f, j) => ({ label: f, value: num(p.vals[j], 2) })),
    pred: { value: fmtPredicted(p.pred, p.std), mode: p.mode, why: p.reason },
  }));
}

const DEMO_ROWS: QueueRow[] = DEMO_BATCH.map((p, i) => ({
  id: `demo-${i}`,
  recipe: Object.entries(p.recipe).map(([label, value]) => ({ label, value: num(value, 2) })),
  pred: { value: fmtPredicted(p.pred, p.std), mode: p.mode, why: p.why },
}));

/** "Next batch": the proposals from the last analysis (GET /api/latest). */
export function BatchPanel({
  latest,
  state,
  demoMode,
  outOfSync,
  onRetry,
  busy,
}: {
  latest: LatestResult | null;
  state: QueueState;
  demoMode: boolean;
  outOfSync: boolean;
  onRetry: () => void;
  busy: boolean;
}) {
  const populated = latest && latest.has_data ? latest : null;
  const real = populated && populated.proposals.length > 0 ? populated : null;
  const showDemo = !real && demoMode;
  const coverage = real ? coveragePct(real.conformal_coverage) : null;
  const sub = real
    ? `From the last analysis${real.conformal_q != null ? ` · ± ${num(real.conformal_q, 2)} conformal band${coverage ? ` (${coverage})` : ""}` : ""}`
    : showDemo
      ? "No live proposals - showing the demo batch."
      : null;

  return (
    <div>
      <PanelHead crumbs={["campaign", "next batch"]} badge={state === "data" && showDemo ? <DemoBadge /> : undefined} />
      {state === "loading" ? (
        <Loading label="Checking the portal" />
      ) : state === "error" ? (
        <div className="p-4">
          <ErrorState
            title="Could not reach the analysis service"
            description="The request for the next batch of proposals failed before the engine could respond. This is a connection problem, not an empty queue."
            onRetry={onRetry}
            busy={busy}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {outOfSync && real ? (
            <p className="flex items-start gap-2 rounded-[8px] bg-amber-soft px-3 py-2 text-[12px] text-amber">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              The campaign has changed since this batch was proposed (runs started or results logged), so it may list runs
              already in flight and does not reflect new results yet. Re-propose on Decide to refresh it.
            </p>
          ) : null}
          {sub ? (
            <>
              <p className="text-[12px] text-muted">{sub}</p>
              <div className="overflow-x-auto">
                <RunQueue rows={real ? proposalsToQueueRows(real) : DEMO_ROWS} />
              </div>
              <div>
                <DecideLink>Pick and start runs on Decide</DecideLink>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-muted">
              No proposals yet.{" "}
              <Link href="/campaign/setup" className="font-semibold text-accent-text hover:underline">
                Run an analysis
              </Link>{" "}
              to get a next batch.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** "Progress": measured best-so-far per round - a trajectory, not a forecast. */
export function ProgressPanel({ campaign, error, demo }: { campaign: ActiveCampaign | null; error: boolean; demo: boolean }) {
  if (error || !campaign) {
    return (
      <div>
        <PanelHead crumbs={["campaign", "progress"]} />
        {error ? <CampaignError /> : <p className="p-4 text-[12px] text-muted">No campaign yet.</p>}
      </div>
    );
  }
  const points = campaign.history
    .filter((h): h is { round: number; best: number; n_base: number } => h.best != null)
    .map((h) => ({ round: h.round, best: h.best }));
  return (
    <div>
      <PanelHead crumbs={[campaign.target, "progress"]} badge={demo ? <DemoBadge /> : undefined} />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-fg">Best {campaign.target} so far</div>
            <div className="text-[11px] text-muted">measured, not predicted</div>
          </div>
          <div className="tabular font-mono text-[20px] font-semibold text-fg">{campaign.best == null ? "-" : num(campaign.best, 2)}</div>
        </div>
        {points.length >= 2 ? (
          <div className="h-[150px] w-full">
            <ProgressChart data={points} />
          </div>
        ) : (
          <p className="text-[12px] text-muted">The trajectory appears after the first re-analyze.</p>
        )}
        <table className="tabular w-full max-w-md font-mono text-[12px]">
          <caption className="sr-only">Best measured value and dataset size per round</caption>
          <thead>
            <tr className="text-left text-[10px] text-muted uppercase">
              <th scope="col" className="py-1 font-medium">Round</th>
              <th scope="col" className="py-1 text-right font-medium">Best</th>
              <th scope="col" className="py-1 text-right font-medium">Rows</th>
            </tr>
          </thead>
          <tbody>
            {[...campaign.history].reverse().map((h) => (
              <tr key={h.round} className="border-t border-border">
                <td className="py-1 text-fg">{h.round}</td>
                <td className="py-1 text-right text-fg">{h.best == null ? "-" : num(h.best, 2)}</td>
                <td className="py-1 text-right text-muted">{h.n_base}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One started run: its recipe, prediction, and (once logged) its result. */
export function RunPanel({ run, campaign, demo }: { run: CampaignRun; campaign: ActiveCampaign; demo: boolean }) {
  const measuredValue = run.awaiting ? null : run.result;
  // The campaign's feature order first, then anything else the recipe carries.
  const features = [
    ...campaign.features.filter((f) => f in run.recipe),
    ...Object.keys(run.recipe).filter((k) => !campaign.features.includes(k)),
  ];
  const rows: [string, ReactNode][] = [
    ["Predicted", fmtPredicted(run.pred, run.std)],
    ["Measured", measuredValue == null ? <span className="text-muted">awaiting result</span> : num(measuredValue, 2)],
  ];
  if (measuredValue != null) {
    const delta = measuredValue - run.pred;
    rows.push(["Measured − predicted", `${delta >= 0 ? "+" : ""}${num(delta, 2)}`]);
  }
  return (
    <div>
      <PanelHead crumbs={[campaign.target, run.awaiting ? "in flight" : "measured", shortId(run.id)]} badge={demo ? <DemoBadge /> : undefined} />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[15px] font-semibold text-fg">Run {shortId(run.id)}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              run.awaiting ? "bg-amber-soft text-amber" : "bg-green-soft text-green",
            )}
          >
            {run.awaiting ? "In flight" : "Measured"}
          </span>
          <Tag mode={run.mode} />
        </div>
        <section aria-label="Recipe">
          <h3 className="mb-1.5 text-[10px] font-semibold tracking-wide text-muted uppercase">Recipe</h3>
          <dl className="grid max-w-md grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 font-mono text-[12px]">
            {features.map((f) => (
              <div key={f} className="contents">
                <dt className="truncate text-muted">{f}</dt>
                <dd className="tabular text-right text-fg">{num(run.recipe[f], 2)}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-label="Outcome">
          <h3 className="mb-1.5 text-[10px] font-semibold tracking-wide text-muted uppercase">Outcome</h3>
          <dl className="grid max-w-md grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 font-mono text-[12px]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="tabular text-right text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <p className="text-[12px] text-muted">
          <span className="font-semibold text-fg">Why: </span>
          {run.reason}
        </p>
        <div>
          <DecideLink>{run.awaiting ? "Log the result on Decide" : "Re-propose with this result on Decide"}</DecideLink>
        </div>
      </div>
    </div>
  );
}

