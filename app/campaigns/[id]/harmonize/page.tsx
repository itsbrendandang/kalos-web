"use client";

import { useReducer, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ColumnConfirm } from "@/components/campaign/column-confirm";
import { ReplaceRunsDialog } from "@/components/campaign/replace-runs-dialog";
import { SheetPicker } from "@/components/campaign/sheet-picker";
import { UploadZone } from "@/components/campaign/upload-zone";
import { ValidationSummary } from "@/components/campaign/validation-summary";
import { jobProblem } from "@/components/harmonize/data-facts";
import { PriorDataIntro } from "@/components/harmonize/prior-data-intro";
import { DataPictures, DesignSpace, YourData } from "@/components/harmonize/your-data";
import { Callout } from "@/components/kit/callout";
import { CycleStepper } from "@/components/kit/cycle-stepper";
import { ElapsedProgress, JobProgress } from "@/components/kit/job-progress";
import { PageHeader } from "@/components/kit/page-header";
import { FirstRunSetup } from "@/components/setup/first-run-setup";
import { SetupSection } from "@/components/setup/setup-section";
import { Section } from "@/components/kit/section";
import { formatTimestamp, shortHash, SourceLine } from "@/components/kit/source-line";
import { Verdict } from "@/components/kit/verdict";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { isNotFound, useCampaign, useCampaignDetail, useCampaignId, useEngineWrites, useLatest, useUploadJob } from "@/hooks/use-engine";
import { CampaignHasRunsError, isJobActive, targetUnitOf, type ColumnRolesInput, type PopulatedResult, type ProvenanceEntry } from "@/lib/api";
import { campaignStage, cycleSteps } from "@/lib/campaign-stage";
import { EngineError, engineMessage, errorMessage } from "@/lib/engine-error";
import { formatValue } from "@/lib/num";
import { campaignHref } from "@/lib/routes";
import { canActOnAnalysis, initialSetupState, isStale, nextAction, setupReducer, singleFlight, staleNotice } from "@/lib/setup-attempt";
import { sheetSelector, sheetsFrom } from "@/lib/sheet-choice";
import { scanSheet, type DataTypeCounts, type SheetScan } from "@/lib/sheet-columns";
import { columnsFromProvenance, mergeTargets } from "@/lib/sheet-roles";

/**
 * Harmonize (cycle step 1): bring the prior runs, choose the one target and the campaign setup, and see
 * what the engine read.
 *
 * First run: the user picks a sheet, the browser reads its columns, the target is chosen once, then the
 * campaign setup (goal, unit, bounds, constraints) is saved with PUT /setup, and only then is the upload job
 * submitted (components/setup/first-run-setup.tsx). With an analysis, the target can be changed in one place
 * only, the column check (ColumnConfirm), and the setup section shows how the setup was applied and edits it.
 *
 * Uploads run as engine background jobs held by the campaign's EngineDataProvider, so progress shows
 * from `useUploadJob().job` even when this page instance did not start the job (navigation, reload,
 * another tab). Everything under "Your data" is built from analysis fields only. Changing the target or
 * the column roles re-fits from the file this page still holds; after a reload the file is gone, so the
 * page asks for it again.
 */
export default function HarmonizePage() {
  const id = useCampaignId();
  const latest = useLatest();
  const campaign = useCampaign();
  const detail = useCampaignDetail();
  const archived = detail.data?.campaign.archived === true;
  const upload = useUploadJob();
  const { runFile } = useEngineWrites();
  const router = useRouter();
  // Which file the shown analysis came from, whether this page's last attempt failed, and whether the user
  // confirmed the columns. See lib/setup-attempt.ts: a failed upload leaves the PREVIOUS analysis on screen.
  const [state, dispatch] = useReducer(setupReducer, initialSetupState);
  const { file, failed, confirmed } = state;
  // An attempt this page started: when, and which job was current before it (to tell "sending" from "analyzing").
  const [attempt, setAttempt] = useState<{ startedAt: number; priorJob: string | null } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // What the browser read from the held file, tagged with its file so a slow scan never describes another one.
  const [scanned, setScanned] = useState<{ file: File; scan: SheetScan } | null>(null);
  const scan = scanned && scanned.file === file ? scanned.scan : null;
  // The roles last sent to the engine (undefined = inferred) and the full list of target candidates.
  const [roles, setRoles] = useState<ColumnRolesInput | undefined>(undefined);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [formerTargets, setFormerTargets] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<ProvenanceEntry[]>([]);
  // An upload refused with 409 campaign_has_runs, held until the user answers the replace dialog.
  const [pending, setPending] = useState<{ file: File; target?: string; roles?: ColumnRolesInput; sheet?: string; refusal: CampaignHasRunsError } | null>(null);
  const flight = useRef(singleFlight());
  // First run: the sheet the user picked, held in the browser for the setup step until "Save and analyze".
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftTarget, setDraftTarget] = useState<string | undefined>(undefined);

  const job = upload.job;
  const jobActive = isJobActive(job);
  const busy = attempt !== null || jobActive;

  function analyze(f: File, target?: string, nextRoles?: ColumnRolesInput, sheet?: string, replace = false) {
    return flight.current(() => runAnalysis(f, target, nextRoles, sheet, replace));
  }

  async function runAnalysis(f: File, target?: string, nextRoles?: ColumnRolesInput, sheet?: string, replace = false) {
    // A different file, or another worksheet of the same file, is new data: roles, targets and scan restart.
    const fresh = f !== file || sheet !== undefined;
    const sheetArg = sheet ?? (fresh ? undefined : (state.sheetUsed ?? undefined));
    setCancelError(null);
    // An earlier finished job's outcome no longer describes what is on screen.
    upload.dismiss();
    setAttempt({ startedAt: Date.now(), priorJob: job?.id ?? null });
    try {
      const d = await runFile(f, target, nextRoles, sheetArg, { replace });
      dispatch({ type: "start" });
      if (d.error) {
        // The engine's { error } is a problem with the sheet, shown as plain copy, never the raw code.
        dispatch({ type: "failure", file: f, error: engineMessage({ code: d.code, error: d.error }).message, sheets: sheetsFrom(d) });
        return;
      }
      const before = latest.data?.has_data ? latest.data.target : undefined;
      if (fresh) setFormerTargets([]);
      else if (before && d.target && d.target !== before) setFormerTargets((p) => (p.includes(before) ? p : [...p, before]));
      setRoles(nextRoles);
      if (nextRoles === undefined) setBaseline(d.provenance ?? []);
      setCandidates((prev) => mergeTargets(fresh ? [] : prev, d.targets ?? [], nextRoles !== undefined));
      dispatch({ type: "success", file: f, sheets: sheetsFrom(d), sheetUsed: d.sheet_used ?? null });
      if (fresh) void scanSheet(f, d.sheet_used ?? sheetArg).then((r) => setScanned({ file: f, scan: r }));
    } catch (err) {
      if (err instanceof CampaignHasRunsError) {
        // Nothing was replaced: keep the current file, target and analysis, and ask first.
        setPending({ file: f, target, roles: nextRoles, sheet, refusal: err });
        return;
      }
      // A cancel is reported from the job itself (below), the same way whether or not this page started it.
      if (err instanceof EngineError && err.code === "job_cancelled") return;
      const copy = errorMessage(err);
      if (copy.signIn) router.push(`/sign-in?next=${encodeURIComponent(campaignHref(id, "harmonize"))}`);
      dispatch({ type: "start" });
      dispatch({ type: "failure", file: f, error: copy.message });
    } finally {
      setAttempt(null);
    }
  }

  async function cancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      await upload.cancel();
    } catch (err) {
      setCancelError(errorMessage(err).message);
    } finally {
      setCancelling(false);
    }
  }

  const stage = campaignStage(latest.data ?? { has_data: false }, campaign.data ?? { has_campaign: false }, id);
  const header = (action?: ReactNode) => (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Step 1 of 3"
        title="Harmonize your data"
        description="Bring the runs you already have, choose the one outcome to improve and the campaign's goal, and check what Kalos read from the sheet."
        action={action}
      />
      <CycleStepper steps={cycleSteps(stage, id)} round={stage.round} active="harmonize" />
    </div>
  );

  if (latest.status === "error") {
    return (
      <div className="flex flex-col gap-8">
        {header()}
        {isNotFound(latest) ? (
          <ErrorState title="This campaign was not found" description="It does not exist, or you do not have access to it. This is not a problem with your data." />
        ) : (
          <ErrorState
            description={latest.failure instanceof EngineError ? `${errorMessage(latest.failure).message} This is a connection problem, not a result: your data is unaffected.` : undefined}
            onRetry={() => void latest.refresh()}
            busy={latest.refreshing}
          />
        )}
      </div>
    );
  }
  if (latest.status === "loading" || !latest.data) {
    return (
      <div className="flex flex-col gap-8">
        {header()}
        <LoadingSkeleton variant="rows" rows={4} label="Loading the campaign's data" />
      </div>
    );
  }

  const analysis = latest.data.has_data ? latest.data : null;
  const stale = isStale(state);
  const action = nextAction(state, { hasAnalysis: !!analysis, validationFailed: analysis?.validation?.status === "fail" });
  const picker = sheetSelector({ heldFile: file, heldSheets: state.sheets, sheetUsed: state.sheetUsed, failed });
  // This page's attempt before its job exists ("sending"), or after its job ended while the new analysis loads.
  const ownJob = attempt !== null && job !== null && job.id !== attempt.priorJob;
  const sending = attempt !== null && !jobActive;
  // A finished job's problem, when this page has no richer account of its own (e.g. it resumed the job).
  const fromJob = !failed && !attempt ? jobProblem(job) : null;

  const continueAction =
    action.visible && !busy ? (
      <div className="flex flex-col items-end gap-1">
        <Link href={campaignHref(id, "predict")} className={buttonVariants({ variant: action.emphasis === "primary" ? "default" : "outline" })}>
          Continue to Predict
          <ArrowRight />
        </Link>
        {action.hint ? <span className="text-caption text-fg-muted">{action.hint}</span> : null}
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-10">
      {header(continueAction)}

      <ReplaceRunsDialog
        refusal={pending?.refusal ?? null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (p) void analyze(p.file, p.target, p.roles, p.sheet, true);
        }}
      />

      {failed || fromJob || (job && jobActive) || sending ? (
        <div className="flex flex-col gap-4">
          {failed ? (
            <Callout
              tone="bad"
              title={`${failed.name} could not be analyzed`}
              action={
                stale && file ? (
                  <Button size="sm" variant="outline" onClick={() => dispatch({ type: "keepPrevious" })}>
                    Keep working with {analysis?.dataset ?? "the previous sheet"}
                  </Button>
                ) : undefined
              }
            >
              <p>{failed.error}</p>
              {analysis ? (
                <p className="mt-1 text-fg-muted">
                  {staleNotice(state, analysis.dataset)} Nothing below belongs to {failed.name}
                  {file ? "; the columns cannot be confirmed or re-fitted until you upload another file or keep working with the previous one." : "."}
                </p>
              ) : null}
            </Callout>
          ) : fromJob ? (
            <Callout
              tone={fromJob.kind === "cancelled" ? "neutral" : "bad"}
              title={fromJob.kind === "cancelled" ? "The upload was cancelled" : "The last upload could not be analyzed"}
              action={
                <Button size="sm" variant="outline" onClick={upload.dismiss}>
                  Dismiss
                </Button>
              }
            >
              <p>{engineMessage({ code: fromJob.code, error: fromJob.detail }).message}</p>
              <p className="mt-1 text-fg-muted">
                {analysis ? `The analysis below is still the one from ${analysis.dataset}.` : "Nothing was saved to this campaign."}
              </p>
            </Callout>
          ) : null}
          {picker && failed && !busy ? <SheetPicker selector={picker} busy={busy} onPick={(f, sh) => void analyze(f, undefined, undefined, sh)} /> : null}
          {job && jobActive ? (
            <JobProgress job={job} onCancel={() => void cancel()} cancelling={cancelling} pollTrouble={upload.pollTrouble} />
          ) : sending ? (
            ownJob ? (
              <ElapsedProgress title="Loading the new analysis" note="The engine finished; fetching the saved analysis." startedAt={attempt?.startedAt ?? null} />
            ) : (
              <ElapsedProgress
                title="Sending the sheet to the engine"
                note="The engine checks the sheet before it queues the analysis; a sheet it cannot use is refused here, before any fitting."
                startedAt={attempt?.startedAt ?? null}
              />
            )
          ) : null}
          {cancelError ? <p className="text-caption text-bad">Could not cancel: {cancelError}</p> : null}
        </div>
      ) : null}

      {analysis ? (
        <AnalysisView
          analysis={analysis}
          stale={stale}
          busy={busy}
          file={file}
          confirmed={confirmed}
          canAct={canActOnAnalysis(state) && !archived}
          archived={archived}
          campaignId={id}
          nMeasured={campaign.data?.has_campaign ? campaign.data.n_measured : null}
          targetChoices={candidates.length ? candidates : (analysis.targets ?? [])}
          roles={{ sentRoles: roles, formerTargets, baseline }}
          scan={scan}
          picker={picker && !failed ? <SheetPicker selector={picker} busy={busy} onPick={(f, sh) => void analyze(f, undefined, undefined, sh)} /> : null}
          onConfirm={() => dispatch({ type: "confirm" })}
          onRefit={(r) => file && void analyze(file, r.target, r)}
          onFile={(f) => void analyze(f)}
        />
      ) : busy ? null : archived ? (
        <p className="text-body text-fg-muted">This campaign is archived, so it is read-only: no sheet can be uploaded. An organization admin can unarchive it from the campaign list.</p>
      ) : draftFile ? (
        <FirstRunSetup
          key={`${draftFile.name}:${draftFile.lastModified}:${draftFile.size}`}
          campaignId={id}
          file={draftFile}
          busy={busy}
          onChooseAnother={() => setDraftFile(null)}
          initialTarget={draftTarget}
          onAnalyze={(f, t, sh) => {
            setDraftTarget(t);
            void analyze(f, t, undefined, sh);
          }}
        />
      ) : (
        <>
          <PriorDataIntro />
          <UploadZone onFile={setDraftFile} disabled={busy} />
        </>
      )}
    </div>
  );
}

function AnalysisView({
  analysis,
  stale,
  busy,
  file,
  confirmed,
  canAct,
  archived,
  campaignId,
  nMeasured,
  targetChoices,
  roles,
  scan,
  picker,
  onConfirm,
  onRefit,
  onFile,
}: {
  analysis: PopulatedResult;
  stale: boolean;
  busy: boolean;
  file: File | null;
  confirmed: boolean;
  canAct: boolean;
  archived: boolean;
  campaignId: string;
  nMeasured: number | null;
  targetChoices: string[];
  roles: { sentRoles?: ColumnRolesInput; formerTargets: string[]; baseline: ProvenanceEntry[] };
  scan: SheetScan | null;
  picker: ReactNode;
  onConfirm: () => void;
  onRefit: (r: ColumnRolesInput) => void;
  onFile: (f: File) => void;
}) {
  const columns = columnsFromProvenance(analysis.provenance, roles);
  const report = analysis.validation;
  const run = analysis.run;
  return (
    <div
      className="flex flex-col gap-10"
      role={stale ? "group" : undefined}
      aria-label={stale ? "Previous analysis (not the file you just uploaded)" : undefined}
    >
      <Section
        id="target"
        title="Target and inputs"
        description={`${analysis.dataset}: ${count(analysis.n)} runs used, ${count(analysis.d)} inputs.${busy ? " Shown until the new analysis is ready." : ""}`}
      >
        <TargetLine analysis={analysis} />
        {picker}
        {canAct && file && !confirmed && columns.length > 0 ? (
          <ColumnConfirm
            key={`${analysis.updated}-${analysis.target}`}
            columns={columns}
            target={analysis.target}
            targets={targetChoices}
            busy={busy}
            onConfirm={onConfirm}
            onRefit={onRefit}
          />
        ) : (
          <p className="text-caption text-fg-muted">
            Inputs used: {analysis.features.join(", ")}.
            {archived
              ? " This campaign is archived, so its columns cannot change."
              : stale
                ? " The target and the columns cannot change while the previous analysis is shown."
                : busy
                  ? " They cannot change while an upload is being analyzed."
                  : file
                    ? confirmed
                      ? " You confirmed these columns."
                      : ""
                    : " To change the target or the columns, upload the sheet again."}{" "}
            {run?.roles_declared
              ? "This fit used column roles you declared. They apply to this upload only: a later re-analysis infers roles from the column names again."
              : "Roles were inferred from the column names. Roles you declare apply to one upload; a later re-analysis infers them again."}
          </p>
        )}
        {scan?.dataType ? <DataTypeNote counts={scan.dataType} /> : null}
        {file && scan && !scan.scanned ? (
          <p className="text-caption text-fg-muted">
            Row types (a data_type column) could not be checked in the browser for this file (files over 5 MB are not read here). Check the sheet for mixed
            measured and synthetic rows.
          </p>
        ) : null}
      </Section>

      <SetupSection campaignId={campaignId} analysis={analysis} archived={archived} nMeasured={nMeasured} />

      <YourData analysis={analysis} roles={roles} quality={<Section id="data-check" title="Data check" description="The engine's checks on the sheet, run before the model was fitted.">
        {report ? (
          <ValidationSummary report={report} />
        ) : (
          <p className="text-body text-fg-muted">This analysis came without a data check, so nothing here should be read as a pass.</p>
        )}
      </Section>} />
      <DesignSpace analysis={analysis} />
      <DataPictures analysis={analysis} />

      <SourceLine
        parts={[
          { label: "Dataset", value: analysis.dataset },
          { label: "File", value: run?.filename != null ? `${run.filename}${run.sheet ? ` (${run.sheet})` : ""}` : null },
          { label: "Input", value: shortHash(run?.input_sha256), title: run?.input_sha256 },
          { label: "Engine", value: analysis.engine_version ?? null },
          { label: "Analyzed", value: formatTimestamp(analysis.timestamp ?? analysis.updated) },
        ]}
      />

      {archived ? null : (
        <Section
          id="replace"
          title="Replace the data"
          description="A new sheet replaces this campaign's base runs and discards its pending runs, awaiting or measured. If there are any, Kalos asks before replacing anything. The campaign setup stays and is applied to the new sheet."
        >
          <UploadZone onFile={onFile} disabled={busy} compact label="Upload a different run sheet" />
        </Section>
      )}
    </div>
  );
}

/**
 * The target, its unit and the goal, read-only: the target is changed in one place, the column check below
 * (or by uploading the sheet again), and the goal and unit in the campaign setup.
 */
function TargetLine({ analysis }: { analysis: PopulatedResult }) {
  const unit = analysis.target_unit;
  return (
    <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-3">
      <div>
        <dt className="text-caption text-fg-muted">Target</dt>
        <dd className="font-mono text-code break-all text-fg">{analysis.target}</dd>
      </div>
      <div>
        <dt className="text-caption text-fg-muted">Goal</dt>
        <dd className="text-body text-fg">{analysis.goal === "minimize" ? "Minimize" : "Maximize"}</dd>
      </div>
      <div>
        <dt className="text-caption text-fg-muted">Unit</dt>
        <dd className="text-body text-fg">
          {unit === undefined ? (
            (targetUnitOf(analysis) ?? "n/a")
          ) : unit.unit ? (
            <>
              {unit.unit}{" "}
              <span className="text-caption text-fg-muted">{unit.source === "user" ? "(set in the campaign setup)" : "(read from the column header)"}</span>
            </>
          ) : (
            <span className="text-fg-muted">None: the header states no recognized unit. Set one in the campaign setup.</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

/** A count through lib/num ("1,204"); "n/a" when the engine sent nothing, never 0. */
const count = (n: number | null | undefined) => formatValue(n, { quantity: "count" }).text;

/** Surfaces a data_type column so measured and synthetic rows are never silently pooled. */
function DataTypeNote({ counts }: { counts: DataTypeCounts }) {
  const list = counts.counts.map((c) => `${c.value} ${count(c.n)}`).join(", ");
  const mixed = counts.counts.some((c) => !/^(real|measured)$/i.test(c.value));
  return mixed ? (
    <Verdict tone="warn" detail="The model is fitted on every row. Rows that are not real measurements can make results look better than the lab would see.">
      This sheet mixes row types ({counts.column}: {list}).
    </Verdict>
  ) : (
    <p className="text-caption text-fg-muted">
      {counts.column}: {list}.
    </p>
  );
}
