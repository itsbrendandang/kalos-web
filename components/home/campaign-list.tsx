"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Pencil } from "lucide-react";
import { MeasuredValue } from "@/components/campaign/plan/marks";
import { formatTimestamp } from "@/components/kit/source-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCampaignDetail, type CampaignDetail, type CampaignMeta } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { campaignRowSummary } from "@/lib/home";
import { campaignHref } from "@/lib/routes";
import { parseUnit } from "@/lib/utils";

/**
 * Every campaign as one row. The list itself (GET /api/campaigns) only says
 * which campaigns exist; each row then reads its own summary
 * (GET /api/campaigns/{id}) for the round, target, measured best, runs
 * awaiting results and the engine's next action. A row whose summary fails
 * says so; it never shows zeros in place of missing numbers.
 */
export function CampaignList({ campaigns, onRename }: { campaigns: CampaignMeta[]; onRename: (c: CampaignMeta) => void }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {campaigns.map((c) => (
        <CampaignRow key={c.id} meta={c} onRename={() => onRename(c)} />
      ))}
    </ul>
  );
}

type RowState = { status: "loading" } | { status: "error" } | { status: "data"; detail: CampaignDetail };

/** The campaign's summary, refetched when the list reports the campaign changed. */
function useRowDetail(id: string, updatedAt: number) {
  const [state, setState] = useState<RowState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getCampaignDetail(id).then(
      (detail) => !cancelled && setState({ status: "data", detail }),
      () => !cancelled && setState((s) => (s.status === "data" ? s : { status: "error" })),
    );
    return () => {
      cancelled = true;
    };
  }, [id, updatedAt, attempt]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return [state, retry] as const;
}

function CampaignRow({ meta, onRename }: { meta: CampaignMeta; onRename: () => void }) {
  const [state, retry] = useRowDetail(meta.id, meta.updated_at);
  const row = state.status === "data" ? campaignRowSummary(state.detail) : null;
  const unit = row?.target ? parseUnit(row.target) : "";
  return (
    <li className="relative flex flex-col gap-4 p-panel transition-colors hover:bg-subtle md:flex-row md:items-center md:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link href={campaignHref(meta.id)} className="min-w-0 text-heading break-words text-fg after:absolute after:inset-0 after:content-['']">
            {meta.name}
          </Link>
          {meta.is_default ? <Badge variant="outline">Default</Badge> : null}
          {row?.round != null ? <Badge tone="accent">Round {row.round}</Badge> : null}
          {!meta.seeded ? <Badge variant="outline">No data yet</Badge> : null}
        </div>
        <p className="mt-1 text-caption text-fg-muted">
          {row?.target ? (
            <>
              Maximize <span className="font-mono text-code text-fg">{row.target}</span>
              {" · "}
            </>
          ) : null}
          Updated {formatTimestamp(meta.updated_at)}
        </p>
      </div>

      {state.status === "loading" ? (
        <div className="flex flex-col gap-2 md:w-[26rem]" role="status" aria-label={`Loading ${meta.name}`}>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      ) : state.status === "error" ? (
        <div className="relative z-10 flex items-center gap-3 md:w-[26rem]">
          <p className="text-caption text-fg-muted">Could not load this campaign&apos;s summary. This is a connection problem, not a result.</p>
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : row ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 md:w-[26rem] md:grid-cols-[auto_1fr]">
          {row.hasData ? (
            <>
              <div>
                <dt className="text-caption text-fg-muted">Best so far</dt>
                <dd className="text-label">
                  <MeasuredValue value={formatNumber(row.best)} unit={row.best != null ? unit || undefined : undefined} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-fg-muted">Runs awaiting results</dt>
                <dd className="text-label text-fg tabular-nums">
                  {formatNumber(row.awaiting, "count")}
                  <span className="text-caption text-fg-muted"> · {formatNumber(row.runs, "count")} in the model</span>
                </dd>
              </div>
            </>
          ) : null}
          <div className="col-span-2">
            <dt className="text-caption text-fg-muted">Next</dt>
            <dd className="flex items-center gap-1 text-label text-fg">
              {row.next.action}
              <ArrowRight className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
            </dd>
          </div>
        </dl>
      ) : null}

      <Button variant="ghost" size="icon-sm" onClick={onRename} aria-label={`Rename ${meta.name}`} className="relative z-10 self-start md:self-center">
        <Pencil aria-hidden />
      </Button>
    </li>
  );
}
