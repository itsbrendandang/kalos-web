"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ColumnConfirm } from "@/components/campaign/column-confirm";
import { FitProgress, useElapsedSeconds } from "@/components/campaign/fit-progress";
import { UploadZone } from "@/components/campaign/upload-zone";
import { ValidationSummary } from "@/components/campaign/validation-summary";
import { Callout } from "@/components/kit/callout";
import { PageHeader } from "@/components/kit/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCampaign, useEngineWrites, useLatest } from "@/hooks/use-engine";
import type { ColumnRolesInput } from "@/lib/api";
import { campaignStage } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";
import { scanSheet, type DataTypeCounts, type SheetScan } from "@/lib/sheet-columns";
import { columnsFromProvenance, mergeTargets } from "@/lib/sheet-roles";

/**
 * Setup: upload a run sheet, choose the target, read the data check. The
 * analysis shown is the shared /api/latest, so it survives navigation and the
 * shell updates the moment an upload lands. Changing the target re-fits from
 * the file still held here, so after a reload the picker asks for the file again.
 */
export default function SetupPage() {
  const latest = useLatest();
  const campaign = useCampaign();
  const { runFile } = useEngineWrites();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<SheetScan | null>(null);
  // Bumped per upload so a slow scan of an earlier file cannot overwrite the current file's result.
  const scanSeq = useRef(0);
  // The roles last sent to the engine (undefined = the engine inferred them), and the full list of
  // target candidates: after a roles fit the engine lists only the chosen target.
  const [roles, setRoles] = useState<ColumnRolesInput | undefined>(undefined);
  const [candidates, setCandidates] = useState<string[]>([]);
  // Targets the user moved away from for this file: their old target is not an input, and should not read as a data problem.
  const [formerTargets, setFormerTargets] = useState<string[]>([]);
  // The user has looked at the detected columns for THIS fit; any re-fit or new upload clears it.
  const [confirmed, setConfirmed] = useState(false);
  const elapsed = useElapsedSeconds(busy);

  async function analyze(f: File, target?: string, nextRoles?: ColumnRolesInput) {
    if (f !== file) {
      const seq = ++scanSeq.current;
      setScan(null);
      setRoles(undefined);
      setCandidates([]);
      setFormerTargets([]);
      void scanSheet(f).then((r) => {
        if (seq === scanSeq.current) setScan(r);
      });
    }
    setFile(f);
    setConfirmed(false);
    setBusy(true);
    setError(null);
    try {
      const d = await runFile(f, target, nextRoles);
      if (!d.error) {
        const before = latest.data?.has_data ? latest.data.target : undefined;
        if (f === file && before && d.target && d.target !== before) setFormerTargets((p) => (p.includes(before) ? p : [...p, before]));
        setRoles(nextRoles);
        setCandidates((prev) => mergeTargets(prev, d.targets ?? [], nextRoles !== undefined));
      }
      // The engine's own { error } is a problem with the sheet, not the connection.
      if (d.error) setError(d.error);
    } catch {
      setError("The analysis service did not respond. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (latest.status === "error" && !latest.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Set up the campaign" />
        <ErrorState onRetry={() => void latest.refresh()} busy={latest.refreshing} />
      </div>
    );
  }

  const analysis = latest.data?.has_data ? latest.data : null;
  const columns = columnsFromProvenance(analysis?.provenance, { sentRoles: roles, formerTargets });
  const targetChoices = candidates.length ? candidates : (analysis?.targets ?? []);
  const report = analysis?.validation;
  const next = campaignStage(latest.data ?? { has_data: false }, campaign.data ?? { has_campaign: false }).next;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Set up the campaign"
        description="Upload the runs you already have and choose what to maximize. Kalos checks the sheet, then fits the model."
        action={
          analysis && report?.status !== "fail" && (!file || confirmed) ? (
            <Link href={next.href} className={buttonVariants()}>
              {next.action}
              <ArrowRight />
            </Link>
          ) : null
        }
      />

      <UploadZone onFile={(f) => void analyze(f)} disabled={busy} compact={!!analysis} />

      {error ? <Callout tone="bad" title="This run sheet could not be analyzed">{error}</Callout> : null}
      {busy ? <FitProgress elapsed={elapsed} /> : null}
      {latest.status === "loading" ? <LoadingSkeleton variant="rows" rows={3} /> : null}

      {analysis && !busy ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-body text-fg-muted">
              {analysis.dataset}: {formatNumber(analysis.n, "count")} runs, {formatNumber(analysis.d, "count")} inputs.
            </p>
            <label className="flex flex-col gap-1.5 text-label text-fg sm:max-w-sm">
              Maximize
              <Select
                value={analysis.target}
                onValueChange={(t) => file && t && void analyze(file, t, roles ? { target: t, features: roles.features.filter((c) => c !== t) } : undefined)}
                disabled={!file}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targetChoices.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-caption font-normal text-fg-muted">
                {file ? "Choosing another column re-fits the model without a new upload." : "Upload the sheet again to change the target."}
              </span>
            </label>
          </div>
          {file && !confirmed && columns.length > 0 ? (
            <ColumnConfirm
              key={`${analysis.updated}-${analysis.target}`}
              columns={columns}
              target={analysis.target}
              targets={targetChoices}
              busy={busy}
              onConfirm={() => setConfirmed(true)}
              onRefit={(roles) => void analyze(file, roles.target, roles)}
            />
          ) : (
            <p className="text-caption text-fg-muted">
              Inputs used: {analysis.features.join(", ")}.
              {file ? (confirmed ? " You confirmed these columns." : "") : " From the last analysis; upload the sheet again to change them."}
            </p>
          )}
          {scan?.dataType ? <DataTypeNote counts={scan.dataType} /> : null}
          {file && scan && !scan.scanned ? (
            <p className="text-caption text-fg-muted">Row types (a data_type column) could not be checked for this file type or size.</p>
          ) : null}
          {report ? (
            <ValidationSummary report={report} />
          ) : (
            <p className="text-body text-fg-muted">This analysis came without a data check, so nothing here should be read as a pass.</p>
          )}
        </>
      ) : null}
    </div>
  );
}

/** Surfaces a data_type column so measured and synthetic rows are never silently pooled. */
function DataTypeNote({ counts }: { counts: DataTypeCounts }) {
  const list = counts.counts.map((c) => `${c.value} ${formatNumber(c.n, "count")}`).join(", ");
  const mixed = counts.counts.some((c) => !/^(real|measured)$/i.test(c.value));
  return mixed ? (
    <Callout tone="warn" title={`This sheet mixes row types (${counts.column}: ${list})`}>
      The model is fitted on every row. Rows that are not real measurements can make results look better than the lab would see.
    </Callout>
  ) : (
    <p className="text-caption text-fg-muted">
      {counts.column}: {list}.
    </p>
  );
}
