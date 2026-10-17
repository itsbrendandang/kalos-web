"use client";

import { useReducer, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ColumnConfirm } from "@/components/campaign/column-confirm";
import { FitProgress, useElapsedSeconds } from "@/components/campaign/fit-progress";
import { SheetPicker } from "@/components/campaign/sheet-picker";
import { UploadZone } from "@/components/campaign/upload-zone";
import { ValidationSummary } from "@/components/campaign/validation-summary";
import { Callout } from "@/components/kit/callout";
import { PageHeader } from "@/components/kit/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCampaign, useEngineWrites, useLatest } from "@/hooks/use-engine";
import type { ColumnRolesInput, ProvenanceEntry } from "@/lib/api";
import { campaignStage } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";
import { scanSheet, type DataTypeCounts, type SheetScan } from "@/lib/sheet-columns";
import { columnsFromProvenance, mergeTargets } from "@/lib/sheet-roles";
import { sheetSelector, sheetsFrom } from "@/lib/sheet-choice";
import { canActOnAnalysis, initialSetupState, isStale, nextAction, setupReducer, staleNotice } from "@/lib/setup-attempt";

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
  // Which file the shown analysis came from, whether the last attempt failed, and whether the user
  // confirmed the columns. See lib/setup-attempt.ts: a failed upload leaves the PREVIOUS analysis on
  // screen, so it is marked as such and nothing acts on it until the user says so.
  const [state, dispatch] = useReducer(setupReducer, initialSetupState);
  const { file, failed, confirmed } = state;
  const [busy, setBusy] = useState(false);
  // What the browser read from the held file. Tagged with its file so a slow scan of an earlier or rejected
  // file is never shown for the current one.
  const [scanned, setScanned] = useState<{ file: File; scan: SheetScan } | null>(null);
  const scan = scanned && scanned.file === file ? scanned.scan : null;
  // The roles last sent to the engine (undefined = the engine inferred them), and the full list of
  // target candidates: after a roles fit the engine lists only the chosen target.
  const [roles, setRoles] = useState<ColumnRolesInput | undefined>(undefined);
  const [candidates, setCandidates] = useState<string[]>([]);
  // Targets the user moved away from for this file: their old target is not an input, and should not read as a data problem.
  const [formerTargets, setFormerTargets] = useState<string[]>([]);
  // Provenance of the last fit the engine inferred roles for (see sheet-roles RolesContext.baseline).
  const [baseline, setBaseline] = useState<ProvenanceEntry[]>([]);
  const elapsed = useElapsedSeconds(busy);

  async function analyze(f: File, target?: string, nextRoles?: ColumnRolesInput, sheet?: string) {
    // A different file, or a different worksheet of the same file, is new data: roles, targets and scan restart.
    // A re-fit of the held file keeps reading the worksheet the engine used.
    const fresh = f !== file || sheet !== undefined;
    const sheetArg = sheet ?? (fresh ? undefined : (state.sheetUsed ?? undefined));
    dispatch({ type: "start" });
    setBusy(true);
    try {
      const d = await runFile(f, target, nextRoles, sheetArg);
      if (d.error) {
        // The engine's own { error } is a problem with the sheet, not the connection.
        dispatch({ type: "failure", file: f, error: d.error, sheets: sheetsFrom(d) });
        return;
      }
      // Per-file state is only replaced once the engine accepted the file: a rejected upload must not wipe
      // the roles/targets that still belong to the analysis on screen.
      const before = latest.data?.has_data ? latest.data.target : undefined;
      if (fresh) setFormerTargets([]);
      else if (before && d.target && d.target !== before) setFormerTargets((p) => (p.includes(before) ? p : [...p, before]));
      setRoles(nextRoles);
      if (nextRoles === undefined) setBaseline(d.provenance ?? []);
      setCandidates((prev) => mergeTargets(fresh ? [] : prev, d.targets ?? [], nextRoles !== undefined));
      dispatch({ type: "success", file: f, sheets: sheetsFrom(d), sheetUsed: d.sheet_used ?? null });
      // Scan the worksheet the engine actually read, so the row-type check describes the fitted data.
      if (fresh) void scanSheet(f, d.sheet_used ?? sheetArg).then((r) => setScanned({ file: f, scan: r }));
    } catch {
      dispatch({ type: "failure", file: f, error: "The analysis service did not respond. Try again in a moment." });
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
  const columns = columnsFromProvenance(analysis?.provenance, { sentRoles: roles, formerTargets, baseline });
  const targetChoices = candidates.length ? candidates : (analysis?.targets ?? []);
  const report = analysis?.validation;
  const next = campaignStage(latest.data ?? { has_data: false }, campaign.data ?? { has_campaign: false }).next;
  const stale = isStale(state);
  const notice = staleNotice(state, analysis?.dataset);
  const canAct = canActOnAnalysis(state);
  const picker = sheetSelector({ heldFile: file, heldSheets: state.sheets, sheetUsed: state.sheetUsed, failed });
  // Confirmation is advisory (see lib/setup-attempt.ts nextAction): the fit is already saved on the engine and
  // the sidebar/status bar link straight on, so this action is never a hard gate; it is just quieter until confirmed.
  const action = nextAction(state, { hasAnalysis: !!analysis, validationFailed: report?.status === "fail" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Set up the campaign"
        description="Upload the runs you already have and choose what to maximize. Kalos checks the sheet, then fits the model."
        action={
          action.visible ? (
            <div className="flex flex-col items-end gap-1">
              <Link href={next.href} className={buttonVariants({ variant: action.emphasis === "primary" ? "default" : "outline" })}>
                {next.action}
                <ArrowRight />
              </Link>
              {action.hint ? <span className="text-caption text-fg-muted">{action.hint}</span> : null}
            </div>
          ) : null
        }
      />

      <UploadZone onFile={(f) => void analyze(f)} disabled={busy} compact={!!analysis} />

      {failed ? (
        <Callout tone="bad" title={`${failed.name} could not be analyzed`}>
          {failed.error}
        </Callout>
      ) : null}
      {picker && failed && !busy ? <SheetPicker selector={picker} busy={busy} onPick={(f, sh) => void analyze(f, undefined, undefined, sh)} /> : null}
      {stale && notice && !busy ? (
        <Callout
          tone="warn"
          title="This is the previous analysis"
          action={
            file ? (
              <Button size="sm" variant="outline" onClick={() => dispatch({ type: "keepPrevious" })}>
                Keep working with {analysis?.dataset ?? "it"}
              </Button>
            ) : undefined
          }
        >
          {notice} Nothing below belongs to {failed?.name}, and it cannot be confirmed or re-fitted until you upload another file{file ? " or choose to keep working with the previous one" : ""}.
        </Callout>
      ) : null}
      {busy ? <FitProgress elapsed={elapsed} /> : null}
      {latest.status === "loading" ? <LoadingSkeleton variant="rows" rows={3} /> : null}

      {analysis && !busy ? (
        <div className={stale ? "flex flex-col gap-6 opacity-60" : "flex flex-col gap-6"} role={stale ? "group" : undefined} aria-label={stale ? "Previous analysis (not the file you just uploaded)" : undefined}>
          <div className="flex flex-col gap-2">
            <p className="text-body text-fg-muted">
              {analysis.dataset}: {formatNumber(analysis.n, "count")} runs, {formatNumber(analysis.d, "count")} inputs.
            </p>
            <label className="flex flex-col gap-1.5 text-label text-fg sm:max-w-sm">
              Maximize
              <Select
                value={analysis.target}
                onValueChange={(t) => canAct && file && t && void analyze(file, t, roles ? { target: t, features: roles.features.filter((c) => c !== t) } : undefined)}
                disabled={!canAct}
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
                {stale ? "Unavailable: this is the previous analysis." : file ? "Choosing another column re-fits the model without a new upload." : "Upload the sheet again to change the target."}
              </span>
            </label>
          </div>
          {picker && !failed ? <SheetPicker selector={picker} busy={busy} onPick={(f, sh) => void analyze(f, undefined, undefined, sh)} /> : null}
          {canAct && file && !confirmed && columns.length > 0 ? (
            <ColumnConfirm
              key={`${analysis.updated}-${analysis.target}`}
              columns={columns}
              target={analysis.target}
              targets={targetChoices}
              busy={busy}
              onConfirm={() => dispatch({ type: "confirm" })}
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
            <p className="text-caption text-fg-muted">Row types (a data_type column) could not be checked for this file (legacy .xls and files over 5 MB are not read in the browser). Check the sheet yourself for mixed measured and synthetic rows.</p>
          ) : null}
          {report ? (
            <ValidationSummary report={report} />
          ) : (
            <p className="text-body text-fg-muted">This analysis came without a data check, so nothing here should be read as a pass.</p>
          )}
        </div>
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
