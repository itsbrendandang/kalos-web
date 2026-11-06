"use client";

// How Kalos read each column of a sheet: the provenance list in plain words. Shared by the Data index
// and the per-sheet page. Each row opens to its "Why this matters" line and the status as Kalos wrote it.
// Unknown statuses are never rewritten into prose; they sit in a disclosure with the raw status beside the
// name (app/data/roles.ts).

import { Disclosure } from "@/components/kit/disclosure";
import { Panel, Section } from "@/components/kit/section";
import { WhyLine } from "@/components/kit/why-line";
import { isSparse, roleLabel, roleWhy, unknownStatuses } from "@/app/data/roles";
import type { ProvenanceEntry } from "@/lib/api";
import { formatNumber } from "@/lib/format";

export function ColumnRoles({ provenance, droppedIncomplete }: { provenance: readonly ProvenanceEntry[] | undefined; droppedIncomplete?: number }) {
  if (!provenance?.length) {
    return <p className="text-body text-fg-muted">Kalos did not record how it read each column of this sheet.</p>;
  }
  const unknown = unknownStatuses(provenance);
  return (
    <Section title="How each column was read" description="A column marked not used had no part in the model. Open a column for why that matters.">
      <Panel className="px-5 py-0">
        <ul className="flex flex-col">
          {provenance.map((c) => (
            <li key={c.name}>
              <Disclosure
                className="first:border-t-0"
                summary={
                  <span className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 text-body font-normal sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem]">
                    <span className="min-w-0 break-all font-mono text-code text-fg">{c.name}</span>
                    <span className="col-span-2 text-fg-muted sm:col-span-1">{roleLabel(c.status)}</span>
                    <span className="col-start-2 row-start-1 text-right text-caption tabular-nums text-fg-muted sm:col-start-auto sm:row-start-auto">{formatNumber(c.non_null, "count")} filled</span>
                  </span>
                }
              >
                <div className="flex flex-col gap-1 text-body text-fg-muted">
                  <WhyLine code={roleWhy(c.status, isSparse(c, provenance))} />
                  <p className="text-caption">
                    As Kalos wrote it: <span className="font-mono text-code">{c.status}</span>
                  </p>
                </div>
              </Disclosure>
            </li>
          ))}
        </ul>
      </Panel>
      {droppedIncomplete ? (
        <p className="text-body text-fg-muted">
          {formatNumber(droppedIncomplete, "count")} {droppedIncomplete === 1 ? "run was" : "runs were"} left out because a value was missing.
        </p>
      ) : null}
      {unknown.length ? (
        <Disclosure summary="As Kalos wrote it" meta={`${unknown.length} ${unknown.length === 1 ? "column" : "columns"}`}>
          <p className="mb-2 text-body text-fg-muted">Kalos gave these columns a status this page has no words for yet. The raw status is shown beside each name.</p>
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
  );
}
