"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, CircleCheck, CircleDashed, Crosshair, Database, PanelRightClose, SlidersHorizontal, Trophy } from "lucide-react";
import { ExampleBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { campaignStage } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { campaignView } from "@/lib/workbench";

const ICON = "size-4 shrink-0 text-fg-muted";

/**
 * The right-hand campaign context, shown beside the stage pages and Data on
 * wide screens. It is not a chat: Kalos has no assistant, so instead of a
 * prompt it shows what the engine returned (coverage, the next step) and
 * links to the real views that answer common questions.
 */
export function ContextPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside aria-label="Campaign context" className="hidden w-[360px] shrink-0 flex-col border-l border-border-strong bg-surface xl:flex">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-4">
        <h2 className="flex-1 text-caption text-fg">Campaign context</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide campaign context"
          className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg"
        >
          <PanelRightClose className="size-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ContextBody />
      </div>
    </aside>
  );
}

function Box({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border bg-bg px-3">
        <h3 className="text-caption font-medium text-fg-muted">{title}</h3>
        {meta ? <span className="text-caption text-fg-muted">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex h-10 items-center gap-2.5 border-b border-border px-3 last:border-b-0">
      {icon}
      <dt className="min-w-0 flex-1 truncate text-body text-fg">{label}</dt>
      <dd className="text-body text-fg tabular-nums">{value}</dd>
    </div>
  );
}

function ContextBody() {
  const latest = useLatest();
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);

  // The top bar already shows the connection fault and its retry; one line here is enough.
  if (view.state === "error" || latest.status === "error") {
    return <p className="text-body text-fg-muted">The campaign could not be loaded because the engine did not answer.</p>;
  }
  if (view.state === "loading" || !latest.data) {
    return (
      <div role="status" aria-label="Loading the campaign" className="flex flex-col gap-3">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  const demo = view.state === "data" && view.demo;
  const active = view.state === "data" ? view.campaign : null;
  const stage = campaignStage(demo ? { has_data: true } : latest.data, active ?? { has_campaign: false });

  return (
    <div className="flex flex-col gap-4">
      {active ? (
        <Box title="Data coverage" meta={demo ? <ExampleBadge className="h-5" /> : stage.round ? `Round ${stage.round}` : undefined}>
          <dl>
            <Row icon={<Crosshair className={ICON} aria-hidden />} label="Target" value={<span className="font-mono text-code">{active.target}</span>} />
            <Row icon={<Database className={ICON} aria-hidden />} label="Runs in the dataset" value={formatNumber(active.n_base, "count")} />
            <Row icon={<SlidersHorizontal className={ICON} aria-hidden />} label="Inputs" value={formatNumber(active.features.length, "count")} />
            <Row icon={<CircleDashed className={ICON} aria-hidden />} label="Awaiting results" value={formatNumber(active.n_awaiting, "count")} />
            <Row icon={<CircleCheck className={ICON} aria-hidden />} label="Measured this round" value={formatNumber(active.n_measured, "count")} />
            <Row icon={<Trophy className={ICON} aria-hidden />} label="Best so far, measured" value={formatNumber(active.best)} />
          </dl>
          {!demo && active.analysis_in_sync === false ? (
            <p className="border-t border-border px-3 py-2.5 text-caption text-fg-muted">
              Runs changed since the last analysis, so the proposed batch is out of date. Learn plans a new batch once results are in.
            </p>
          ) : null}
        </Box>
      ) : (
        <p className="text-body text-fg-muted">No campaign yet. Upload a run sheet to start one.</p>
      )}

      <Box title="Next step">
        <div className="flex flex-col gap-3 p-3">
          <p className="text-body text-fg-muted">{stage.next.reason}</p>
          <Link
            href={stage.next.href}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-label text-accent-fg hover:bg-accent-hover"
          >
            {stage.next.action}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Box>

      {active ? (
        <Box title="Explore">
          <ul className="flex flex-col gap-2 p-3">
            {EXPLORE.map((e) => (
              <li key={e.href}>
                <Link
                  href={e.href}
                  className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-body text-fg hover:border-border-strong hover:bg-bg"
                >
                  <span className="flex-1">{e.label(active.target)}</span>
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}
    </div>
  );
}

/** Questions people ask, each answered by a real page, never by generated text. */
const EXPLORE: { href: string; label: (target: string) => string }[] = [
  { href: "/campaign/plan", label: (t) => `Which recipes should we try next for ${t}?` },
  { href: "/campaign/learn", label: (t) => `Which inputs move ${t} the most?` },
  { href: "/campaign/run", label: () => "Which runs are still waiting for a result?" },
  { href: "/campaign/setup", label: () => "Did the run sheet pass the data checks?" },
];
