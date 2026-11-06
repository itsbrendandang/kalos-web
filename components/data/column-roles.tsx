"use client";

// How the engine read each column of a sheet: the provenance list in plain words. Shared by the Data index
// and the per-sheet page. Unknown statuses are never rewritten into prose; they sit in a disclosure with the
// raw status beside the name (app/data/roles.ts).

import { Disclosure } from "@/components/kit/disclosure";
import { Panel, Section } from "@/components/kit/section";
import { roleLabel, unknownStatuses } from "@/app/data/roles";
import type { ProvenanceEntry } from "@/lib/api";
import { formatNumber } from "@/lib/format";

export function ColumnRoles({ provenance, droppedIncomplete }: { provenance: readonly ProvenanceEntry[] | undefined; droppedIncomplete?: number }) {
  if (!provenance?.length) {
    return <p className="text-body text-fg-muted">The engine did not record how it read each column of this sheet.</p>;
  }
  const unknown = unknownStatuses(provenance);
  return (
    <Section title="How each column was read" description="A column marked not used did not influence the model.">
      <Panel className="px-5 py-1">
        <ul className="divide-y divide-border">
          {provenance.map((c) => (
            <li key={c.name} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 py-2.5 text-body sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem]">
              <span className="min-w-0 break-all font-mono text-code text-fg">{c.name}</span>
              <span className="col-span-2 text-fg-muted sm:col-span-1">{roleLabel(c.status)}</span>
              <span className="col-start-2 row-start-1 text-right text-caption tabular-nums text-fg-muted sm:col-start-auto sm:row-start-auto">
                {formatNumber(c.non_null, "count")} filled
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      {droppedIncomplete ? (
        <p className="text-body text-fg-muted">
          {formatNumber(droppedIncomplete, "count")} {droppedIncomplete === 1 ? "row was" : "rows were"} left out because a value was missing.
        </p>
      ) : null}
      {unknown.length ? (
        <Disclosure summary="Engine detail" meta={`${unknown.length} ${unknown.length === 1 ? "column" : "columns"}`}>
          <p className="mb-2 text-body text-fg-muted">The engine gave these columns a status this page has no words for yet. The raw status is shown beside each name.</p>
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
