"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ArrowRight, Milestone } from "lucide-react";
import { formatTimestamp } from "@/components/kit/source-line";
import { useRead } from "@/components/report/report-data";
import { getStages } from "@/lib/api";
import { formatValue } from "@/lib/num";
import { decisionWords, scaleTrackSummary } from "@/lib/overview";
import { campaignHref } from "@/lib/routes";

/** The campaign's scale-up track page. */
export const scaleUpHref = (id: string): string => campaignHref(id, "scale-up");

/**
 * One quiet line on the Overview: the scale-up stage a person recorded as
 * current and the latest recorded go/no-go decision, read from GET /stages.
 * Read only; decisions are recorded on the scale-up page. The engine never
 * computes a stage or a decision, and this line never infers one.
 */
export function ScaleTrackLine({ campaignId }: { campaignId: string }) {
  const read = useRead(useCallback(() => getStages(campaignId), [campaignId]));
  const href = scaleUpHref(campaignId);
  return (
    <section aria-label="Scale-up track" className="grid items-start gap-x-6 gap-y-2 border-t border-border pt-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <p className="flex items-center gap-2 text-label text-fg">
        <Milestone className="size-4 shrink-0 text-fg-muted" aria-hidden />
        Scale-up
      </p>
      <div className="min-w-0 text-body text-fg-muted">
        {read.status === "loading" ? (
          <span role="status">Loading the recorded stage…</span>
        ) : read.status === "unavailable" ? (
          <span>Could not load the scale-up stages. {read.reason}</span>
        ) : (
          <Summary view={read.data} />
        )}
      </div>
      <Link href={href} className="inline-flex w-fit items-center gap-1 text-label text-accent hover:underline">
        Open scale-up
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}

function Summary({ view }: { view: Parameters<typeof scaleTrackSummary>[0] }) {
  const s = scaleTrackSummary(view);
  return (
    <span className="flex flex-col gap-0.5">
      <span>
        Current stage:{" "}
        {s.current ? (
          <span className="text-fg">
            {s.current.label} <span className="font-mono text-code text-fg-muted">{s.current.key}</span>
          </span>
        ) : (
          <span>none recorded</span>
        )}
        <span> (recorded by a person, never computed).</span>
      </span>
      <span>
        Latest gate decision:{" "}
        {s.latest ? (
          <>
            <span className="font-medium text-fg">{decisionWords(s.latest.decision)}</span> at {s.latest.stageLabel}, by {s.latest.decided_by},{" "}
            <span className="tabular-nums">{formatTimestamp(s.latest.decided_at)}</span>.
          </>
        ) : (
          <span>none recorded yet.</span>
        )}{" "}
        <span className="tabular-nums">
          {formatValue(s.recorded, { quantity: "count" }).text} of {formatValue(s.total, { quantity: "count" }).text} gates have a decision.
        </span>
      </span>
    </span>
  );
}
