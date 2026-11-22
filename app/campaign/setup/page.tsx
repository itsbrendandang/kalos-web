"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ColumnConfirm } from "@/components/campaign/column-confirm";
import { FitProgress, useElapsedSeconds } from "@/components/campaign/fit-progress";
import { needsReplaceConfirm, replaceConfirmText, uploadFailure, UploadZone, type RefitTrigger } from "@/components/campaign/upload-zone";
import { ValidationSummary } from "@/components/campaign/validation-summary";
import { Callout } from "@/components/kit/callout";
import { PageHeader } from "@/components/kit/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCampaign, useEngineWrites, useLatest } from "@/hooks/use-engine";
import * as api from "@/lib/api";
import type { ColumnRolesInput } from "@/lib/api";
import { campaignStage } from "@/lib/campaign-stage";
import { describeEngineError } from "@/lib/engine-error";
import { formatNumber } from "@/lib/format";
import { scanSheet, type DataTypeCounts, type SheetScan } from "@/lib/sheet-columns";
import { columnsFromProvenance, mergeTargets } from "@/lib/sheet-roles";

/**
 * Setup: upload a run sheet, choose the target, read the data check. The
 * analysis shown is the shared /api/latest, so it survives navigation and the
 * shell updates the moment an upload lands. Changing the target re-fits from
 * the file still held here, so after a reload the picker asks for the file again.
 *
 * A fit replaces the campaign, so when the campaign has runs (awaiting, or
 * recorded but not yet in the model) every fit asks first. Newer engines also
 * refuse with 409 `campaign_has_runs`, which opens the same question.
 */

/** One fit the page may send: a sheet, plus an explicit target and column roles when re-fitting. */
type FitRequest = { file: File; target?: string; roles?: ColumnRolesInput; trigger: RefitTrigger };

/** Why the last fit did not land. `attempt` is the fit that failed; `before` is /api/latest's stamp when it was sent. */
type Problem =
  | { kind: "sheet" | "other"; title: string; message: string; attempt: FitRequest }
  | { kind: "unreachable"; title: string; message: string; attempt: FitRequest; before: number | null };

export default function SetupPage() {
  const latest = useLatest();
  const campaign = useCampaign();
  const { runFile } = useEngineWrites();
  // `file` is the sheet behind the analysis shown; `pendingFile` is an upload in flight. A failed
  // upload never replaces `file`, so the target picker and Re-fit keep using the fitted sheet.
  const [file, setFile] = useState<File | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // Scans by file, so a failed upload's scan never replaces the fitted file's.
  const [scans, setScans] = useState<ReadonlyMap<File, SheetScan>>(() => new Map());
  // The roles last sent to the engine (undefined = the engine inferred them), and the full list of
  // target candidates: after a roles fit the engine lists only the chosen target.
  const [roles, setRoles] = useState<ColumnRolesInput | undefined>(undefined);
  const [candidates, setCandidates] = useState<string[]>([]);
  // The user has looked at the detected columns for THIS fit; any re-fit or new upload clears it.
  const [confirmed, setConfirmed] = useState(false);
  // A fit waiting for the user to agree that it replaces the campaign's runs.
  const [confirmReplace, setConfirmReplace] = useState<FitRequest | null>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const [checking, setChecking] = useState(false);
  const elapsed = useElapsedSeconds(busy);

  /** Every fit goes through here: ask first when it would drop runs (older engines never send the 409). */
  function request(req: FitRequest) {
    if (needsReplaceConfirm(campaign.data)) setConfirmReplace(req);
    else void send(req, false);
  }

  async function send(req: FitRequest, replace: boolean) {
    const { file: f, target, roles: nextRoles } = req;
    const newFile = f !== file;
    if (newFile && !scans.has(f)) {
      void scanSheet(f).then((r) => setScans((m) => new Map(m).set(f, r)));
    }
    setConfirmReplace(null);
    setPendingFile(f);
    setBusy(true);
    setProblem(null);
    const started = Date.now();
    const before = latest.data?.has_data ? latest.data.updated : null;
    try {
      const d = await runFile(f, target, nextRoles, replace || undefined);
      if (d.error) {
        // The engine's own { error } on a 400/422 is a problem with the sheet, not the connection.
        setProblem({ kind: "sheet", title: "This run sheet could not be analyzed", message: d.error, attempt: req });
      } else {
        adopt(req, d.targets);
      }
    } catch (e) {
      const failure = uploadFailure(e, (Date.now() - started) / 1000);
      if (failure.kind === "confirm") {
        // Refresh so the dialog counts what the engine just refused over.
        void campaign.refresh();
        setConfirmReplace(req);
      } else {
        setProblem(failure.kind === "unreachable" ? { ...failure, attempt: req, before } : { ...failure, attempt: req });
      }
    } finally {
      setBusy(false);
      setPendingFile(null);
    }
  }

  /** Bind a fit that landed to the page: its file, roles and target list. */
  function adopt({ file: f, roles: nextRoles }: FitRequest, targets?: readonly string[]) {
    const sameFile = f === file;
    setFile(f);
    setConfirmed(false);
    setRoles(nextRoles);
    setCandidates((prev) => mergeTargets(sameFile ? prev : [], targets ?? [], nextRoles !== undefined));
    setScans((m) => (m.has(f) ? new Map([[f, m.get(f)!]]) : new Map()));
  }

  /** After no answer the fit may still have landed: reload the latest analysis and adopt it if it is newer. */
  async function checkAgain(p: Extract<Problem, { kind: "unreachable" }>) {
    setChecking(true);
    try {
      const now = await api.getLatest();
      latest.set(now);
      void campaign.refresh();
      if (now.has_data && now.updated !== p.before) {
        adopt(p.attempt, now.targets);
        setProblem(null);
      } else {
        setProblem({ ...p, message: "No new analysis yet. The fit may still be running; check again in a minute, or upload the sheet again." });
      }
    } catch (e) {
      setProblem({ ...p, message: describeEngineError(e) });
    } finally {
      setChecking(false);
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
  const columns = columnsFromProvenance(analysis?.provenance);
  const targetChoices = candidates.length ? candidates : (analysis?.targets ?? []);
  const report = analysis?.validation;
  const next = campaignStage(latest.data ?? { has_data: false }, campaign.data ?? { has_campaign: false }).next;
  const scan = file ? (scans.get(file) ?? null) : null;
  const live = campaign.data?.has_campaign ? campaign.data : null;

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

      <UploadZone onFile={(f) => request({ file: f, trigger: "upload" })} disabled={busy} compact={!!analysis} />

      {problem ? (
        <Callout
          tone="bad"
          title={problem.title}
          action={
            problem.kind === "unreachable" ? (
              <Button variant="outline" size="sm" onClick={() => void checkAgain(problem)} disabled={checking}>
                {checking ? "Checking..." : "Check again"}
              </Button>
            ) : null
          }
        >
          {problem.message}
          {file && problem.attempt.file !== file ? (
            <span className="block text-fg-muted">The analysis below is still from {file.name}.</span>
          ) : null}
        </Callout>
      ) : null}
      {busy ? <FitProgress elapsed={elapsed} /> : null}
      {busy && pendingFile && file && pendingFile !== file ? (
        <p className="text-caption text-fg-muted">Fitting {pendingFile.name}. The current analysis stays until it succeeds.</p>
      ) : null}
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
                onValueChange={(t) =>
                  file &&
                  t &&
                  request({ file, target: t, roles: roles ? { target: t, features: roles.features.filter((c) => c !== t) } : undefined, trigger: "target" })
                }
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
              onRefit={(r) => request({ file, target: r.target, roles: r, trigger: "roles" })}
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

      <Dialog open={confirmReplace != null} onOpenChange={(o) => !o && setConfirmReplace(null)}>
        <DialogContent initialFocus={keepButton}>
          <DialogHeader>
            <DialogTitle>Start a new campaign?</DialogTitle>
            <DialogDescription>
              {replaceConfirmText(confirmReplace?.trigger ?? "upload", live?.n_awaiting, live?.n_measured)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={() => confirmReplace && void send(confirmReplace, true)}>
              Start a new campaign
            </Button>
            <Button ref={keepButton} onClick={() => setConfirmReplace(null)}>
              Keep the current campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
