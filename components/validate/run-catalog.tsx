"use client";

import { useId, useState } from "react";
import { enginePrediction } from "@/components/campaign/learn";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Num, SourceButton } from "@/components/viz/num";
import type { CampaignRun } from "@/lib/api";
import { displayRound } from "@/lib/campaign-stage";
import { sourceFromRun } from "@/lib/source";

function measurementState(run: CampaignRun) {
  return typeof run.result === "number" && Number.isFinite(run.result) ? "measured" : run.awaiting ? "awaiting" : "unavailable";
}

/** Read-only index of the runs in this campaign snapshot; it never joins them to OOF pairs. */
export function RunCatalog({ runs, target, unit }: { runs: CampaignRun[]; target: string; unit: string | null }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const searchId = useId();
  const statusId = useId();
  const visible = runs.filter((run) => (status === "all" || measurementState(run) === status) && `${run.id} ${JSON.stringify(run.recipe)} ${run.round == null ? "" : displayRound(run.round)}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <Section id="run-log" title="Run log" className="scroll-mt-6" description="Read-only catalog of the started runs in this campaign snapshot, including those awaiting results. Measured values come first; predictions are kept separate. Full result history and raw rows are available in Report.">
    <Disclosure summary="Search and inspect run records">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1"><label htmlFor={searchId} className="mb-1 block text-caption text-fg-muted">Find a run or recipe value</label><Input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Run ID, round or recipe value" /></div>
        <div><label htmlFor={statusId} className="mb-1 block text-caption text-fg-muted">Measurement status</label><select id={statusId} value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 max-w-full rounded-lg border border-border-input bg-surface px-3 text-body text-fg"><option value="all">All records</option><option value="measured">Measured</option><option value="awaiting">Awaiting measurement</option><option value="unavailable">Measurement unavailable</option></select></div>
      </div>
      <p className="my-3 text-caption text-fg-muted" role="status">{visible.length} of {runs.length} records shown. Target: {target}{unit ? ` (${unit})` : ""}.</p>
      {visible.length ? <Table containerClassName="max-h-[480px] rounded-xl border border-border">
        <TableHeader><TableRow><TableHead>Run</TableHead><TableHead numeric>Round</TableHead><TableHead>Status</TableHead><TableHead numeric>Measured{unit ? ` (${unit})` : ""}</TableHead><TableHead numeric>Engine prediction{unit ? ` (${unit})` : ""}</TableHead><TableHead>Recipe & provenance</TableHead></TableRow></TableHeader>
        <TableBody>{visible.map((run) => <TableRow key={run.id}>
          <TableCell className="font-mono text-code" title={run.id}>{run.id.slice(0, 8)}</TableCell><TableCell numeric>{run.round == null ? "n/a" : displayRound(run.round)}</TableCell><TableCell>{measurementState(run) === "measured" ? "Measured" : measurementState(run) === "awaiting" ? "Awaiting measurement" : "Unavailable"}</TableCell>
          <TableCell numeric><Num value={run.result} basis="measured" size="table" /></TableCell><TableCell numeric><Num value={enginePrediction(run)} basis="predicted" size="table" /></TableCell>
          <TableCell><details><summary className="cursor-pointer text-label text-accent">Inspect</summary><pre className="mt-2 max-w-72 whitespace-pre-wrap break-all text-caption text-fg-muted">{JSON.stringify(run.recipe, null, 2)}</pre><span className="mt-2 inline-flex items-center gap-1 text-caption">Measured source <SourceButton source={sourceFromRun({ target }, run)} /></span><p className="mt-2 max-w-72 whitespace-normal text-caption text-fg-muted">{enginePrediction(run) == null ? "No finite engine prediction is available. Caller estimates are not relabelled as engine predictions." : "Engine estimate, not a measured outcome."}</p></details></TableCell>
        </TableRow>)}</TableBody>
      </Table> : <p className="text-body text-fg-muted">{runs.length ? "No records match these filters." : "No started runs were reported in this campaign snapshot."}</p>}
    </Disclosure>
  </Section>;
}
