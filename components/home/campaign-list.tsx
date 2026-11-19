"use client";

import Link from "next/link";
import { Archive, Loader2, MoreHorizontal, Pencil, RefreshCw } from "lucide-react";
import { formatTimestamp } from "@/components/kit/source-line";
import { TONE_ICON, TONE_TEXT, type Tone } from "@/components/kit/tone";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Num, NumState } from "@/components/viz/num";
import type { CampaignSummaryRow } from "@/lib/api";
import { formatValue } from "@/lib/num";
import { summaryRowView, type SummaryRowView } from "@/lib/home";
import { campaignHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Every campaign as one row, from the campaign list's summary fields alone (GET /api/campaigns?summary=true,
 * one request for the whole list): target, measured best in the goal's direction, the model's reliability
 * verdict and whether the analysis predates newer results, the stage a person recorded, the latest gate
 * decision and an engine job in progress. No request per campaign.
 */
export function CampaignList({
  campaigns,
  onRename,
  onArchive,
}: {
  campaigns: CampaignSummaryRow[];
  onRename: (c: CampaignSummaryRow) => void;
  onArchive: (c: CampaignSummaryRow) => void;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {campaigns.map((c) => (
        <CampaignRow key={c.id} row={c} onRename={() => onRename(c)} onArchive={() => onArchive(c)} />
      ))}
    </ul>
  );
}

const RELIABILITY_TONE: Record<string, Tone> = { reliable: "good", "not-yet": "warn", "not-judged": "neutral", insufficient: "neutral" };

function CampaignRow({ row, onRename, onArchive }: { row: CampaignSummaryRow; onRename: () => void; onArchive: () => void }) {
  const v = summaryRowView(row);
  return (
    <li className="relative flex flex-col gap-4 p-panel transition-colors hover:bg-subtle md:flex-row md:items-start md:gap-6">
      <div className="min-w-0 flex-1 pr-10 md:pr-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link href={campaignHref(row.id)} className="min-w-0 text-heading break-words text-fg after:absolute after:inset-0 after:content-['']">
            {row.name}
          </Link>
          {row.is_default ? <Badge variant="outline">Default</Badge> : null}
          {v.round != null ? <Badge tone="accent">Round {v.round}</Badge> : null}
          {!v.hasData ? <Badge variant="outline">No data yet</Badge> : null}
        </div>
        <p className="mt-1 text-caption break-words text-fg-muted">
          {v.target ? (
            <>
              {v.goal === "minimize" ? "Minimize" : "Maximize"} <span className="font-mono text-code text-fg">{v.target}</span>
              {" · "}
            </>
          ) : null}
          Updated {formatTimestamp(row.updated_at)}
        </p>
        {v.job ? <JobLine job={v.job} /> : null}
      </div>

      {v.hasData ? <RowFacts v={v} /> : <p className="text-caption text-fg-muted md:w-[30rem]">Upload the prior runs on Harmonize to start.</p>}

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${row.name}`}
          className="absolute top-3 right-3 z-10 grid size-8 shrink-0 place-items-center rounded-lg text-fg hover:bg-surface data-popup-open:bg-surface md:relative md:top-auto md:right-auto md:self-start"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onRename}>
            <Pencil aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onArchive}>
            <Archive aria-hidden />
            Archive…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function RowFacts({ v }: { v: SummaryRowView }) {
  const Icon = v.reliability.kind === "verdict" ? TONE_ICON[RELIABILITY_TONE[v.reliability.state] ?? "neutral"] : null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:w-[30rem]">
      <div className="min-w-0">
        <dt className="text-caption text-fg-muted">Best so far</dt>
        <dd className="text-label">
          {v.best.value != null ? (
            <>
              <Num value={v.best.value} basis="measured" unit={v.unit} />
              <span className="block text-caption font-normal text-fg-muted">{v.best.word}</span>
            </>
          ) : (
            <NumState state={{ kind: "na", reason: "no measured result yet" }} />
          )}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-caption text-fg-muted">Model reliability</dt>
        <dd className="text-label text-fg">
          {v.reliability.kind === "verdict" ? (
            <span className="flex items-center gap-1.5" title={v.reliability.reason}>
              {Icon ? <Icon className={cn("size-4 shrink-0", TONE_TEXT[RELIABILITY_TONE[v.reliability.state] ?? "neutral"])} aria-hidden /> : null}
              {v.reliability.label}
            </span>
          ) : (
            <NumState state={{ kind: "na", reason: v.reliability.reason }} />
          )}
          {v.stale ? (
            <span className="mt-0.5 flex items-center gap-1 text-caption font-normal text-fg-muted">
              <RefreshCw className="size-3.5 shrink-0 text-warn" aria-hidden />
              Analysis predates new results
            </span>
          ) : null}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-caption text-fg-muted">Scale-up stage</dt>
        <dd className="text-label text-fg">{v.stage ? <span className="font-mono text-code">{v.stage}</span> : <span className="font-normal text-fg-muted">not set</span>}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-caption text-fg-muted">Latest gate decision</dt>
        <dd className="text-label text-fg">
          {v.gate ? (
            <>
              {v.gate.word} <span className="font-normal text-fg-muted">at</span> <span className="font-mono text-code">{v.gate.gate}</span>
              <span className="block text-caption font-normal text-fg-muted">{formatTimestamp(v.gate.decidedAt)}</span>
            </>
          ) : (
            <span className="font-normal text-fg-muted">none recorded</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function JobLine({ job }: { job: NonNullable<SummaryRowView["job"]> }) {
  return (
    <p role="status" className="mt-2 flex items-center gap-1.5 text-caption text-fg">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
      {job.kind} running: {job.stage}
      {job.progress != null ? <span className="text-fg-muted tabular-nums"> · {formatValue(job.progress, { quantity: "pct" }).text} (engine-reported)</span> : null}
    </p>
  );
}
