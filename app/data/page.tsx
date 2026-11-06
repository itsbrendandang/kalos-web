"use client";

import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";
import { PageHeader } from "@/components/kit/page-header";
import { Verdict } from "@/components/kit/verdict";
import { Panel, Section } from "@/components/kit/section";
import { Disclosure } from "@/components/kit/disclosure";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useLatest } from "@/hooks/use-engine";
import { formatNumber } from "@/lib/format";
import { roleLabel, runSheetSentence, unknownStatuses } from "./roles";

/**
 * The run sheet the engine is working from, read live from the engine, and
 * how it read each column. This page changes nothing: replacing the sheet
 * happens in Setup.
 */
export default function DataPage() {
  const latest = useLatest();
  const d = latest.status === "error" ? null : latest.data?.has_data ? latest.data : null;
  const unknown = d?.provenance ? unknownStatuses(d.provenance) : [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Data"
        title="Your data"
        description="The run sheet the engine is working from, and how it read each column."
        action={
          d ? (
            <Link href="/campaign/setup" className={buttonVariants({ variant: "outline" })}>
              Replace the run sheet
            </Link>
          ) : null
        }
      />

      {latest.status === "error" ? (
        <ErrorState
          title="Could not reach the engine"
          description="The request failed before the engine could answer. This is a connection problem, not an empty run sheet."
          onRetry={() => void latest.refresh()}
          busy={latest.refreshing}
        />
      ) : !latest.data ? (
        <LoadingSkeleton rows={4} label="Loading your data" />
      ) : !d ? (
        <EmptyState
          icon={Upload}
          title="No run sheet yet"
          description="Upload a run sheet in Setup and the engine's reading of it appears here."
          action={
            <Link href="/campaign/setup" className={buttonVariants({})}>
              Upload a run sheet <ArrowRight />
            </Link>
          }
        />
      ) : (
        <>
          <Verdict tone="good">{runSheetSentence(d)}</Verdict>

          {d.provenance?.length ? (
            <Section
              title="How each column was read"
              description="A column marked not used did not influence the model."
            >
              <Panel className="px-5 py-1">
                <ul className="divide-y divide-border">
                  {d.provenance.map((c) => (
                    <li
                      key={c.name}
                      className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 py-2.5 text-body sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem]"
                    >
                      <span className="min-w-0 break-all font-mono text-code text-fg">{c.name}</span>
                      <span className="col-span-2 text-fg-muted sm:col-span-1">{roleLabel(c.status)}</span>
                      <span className="col-start-2 row-start-1 text-right text-caption tabular-nums text-fg-muted sm:col-start-auto sm:row-start-auto">
                        {formatNumber(c.non_null, "count")} filled
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
              {d.n_dropped_incomplete ? (
                <p className="text-body text-fg-muted">
                  {formatNumber(d.n_dropped_incomplete, "count")} {d.n_dropped_incomplete === 1 ? "row was" : "rows were"} left out because a value was missing.
                </p>
              ) : null}
              {unknown.length ? (
                <Disclosure summary="Engine detail" meta={`${unknown.length} ${unknown.length === 1 ? "column" : "columns"}`}>
                  <p className="mb-2 text-body text-fg-muted">
                    The engine gave these columns a status this page has no words for yet. The raw status is shown beside each name.
                  </p>
                  <ul className="flex flex-col gap-1">
                    {unknown.map((c) => (
                      <li key={c.name} className="flex flex-wrap gap-x-3 text-body">
                        <span className="font-mono text-code text-fg">{c.name}</span>
                        <span className="text-fg-muted">
                          status <span className="font-mono text-code">{c.status}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              ) : null}
            </Section>
          ) : (
            <p className="text-body text-fg-muted">The engine did not record how it read each column of this sheet.</p>
          )}
        </>
      )}
    </div>
  );
}
