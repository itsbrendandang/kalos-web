"use client";

import { useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ColumnChoicePanel } from "@/components/campaign/column-choice";
import { TheModel } from "@/components/campaign/data/the-model";
import type { SheetProfile } from "@/components/campaign/data/profile";
import { useSheetProfile } from "@/components/campaign/data/use-sheet-profile";
import { YourDataView } from "@/components/campaign/data/your-data";
import { FitProgress, useElapsedSeconds } from "@/components/campaign/fit-progress";
import { ReplaceRunsDialog } from "@/components/campaign/replace-runs-dialog";
import { SheetPicker } from "@/components/campaign/sheet-picker";
import { UploadZone } from "@/components/campaign/upload-zone";
import { ValidationSummary } from "@/components/campaign/validation-summary";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Term, WordsLine } from "@/components/kit/term";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useEngineWrites, useLatest } from "@/hooks/use-engine";
import { CampaignHasRunsError, type ColumnRolesInput } from "@/lib/api";
import { engineMessage, errorMessage } from "@/lib/engine-error";
import { campaignStage } from "@/lib/campaign-stage";
import { fitRoom, fitRoomSentence } from "@/lib/fit-rows";
import { formatNumber } from "@/lib/format";
import { scanSheet, type DataTypeCounts, type SheetScan } from "@/lib/sheet-columns";
import { sheetSelector, sheetsFrom } from "@/lib/sheet-choice";
import { rememberSheet } from "@/lib/sheet-store";
import { WhyLine } from "@/components/kit/why-line";
import { canActOnAnalysis, initialSetupState, isStale, nextAction, setupReducer, singleFlight, staleNotice } from "@/lib/setup-attempt";

/**
 * Setup: drop a run sheet, make the one decision (what to raise, what Kalos may change, what every other
 * column is), then build the model. The sheet is read in the browser first; nothing goes to Kalos until the
 * user presses "Build the model". The charts of the sheet sit under "Look at the data", below the decision.
 * The analysis shown is the shared /api/latest, so it survives navigation; after a reload the file is no
 * longer held, so the columns can only be changed by uploading the sheet again.
 */
export default function SetupPage() {
  const latest = useLatest();
  const campaign = useCampaign();
  const { runFile } = useEngineWrites();
  const router = useRouter();
  // Which file the shown analysis came from and whether the last attempt failed. See lib/setup-attempt.ts: a
  // failed upload leaves the PREVIOUS analysis on screen, so it is marked as such and nothing acts on it.
  const [state, dispatch] = useReducer(setupReducer, initialSetupState);
  const { file, failed } = state;
  const [busy, setBusy] = useState(false);
  // The file just dropped: read in the browser at once, before and apart from any fit.
  const [dropped, setDropped] = useState<File | null>(null);
  const profile = useSheetProfile(dropped, dropped === file ? (state.sheetUsed ?? undefined) : undefined);
  // What the browser read from the held file. Tagged with its file so a slow scan of an earlier or rejected
  // file is never shown for the current one.
  const [scanned, setScanned] = useState<{ file: File; scan: SheetScan } | null>(null);
  const scan = scanned && scanned.file === file ? scanned.scan : null;
  // The target chosen on the panel before the fit, so "Look at the data" can draw the target figures at once.
  const [chosenTarget, setChosenTarget] = useState<string | null>(null);
  // An upload the engine refused until the user confirms the replacement. Nothing was replaced, so the
  // held file, roles and analysis stay on screen until the user answers the dialog.
  const [pending, setPending] = useState<{
    file: File;
    target?: string;
    roles?: ColumnRolesInput;
    sheet?: string;
    refusal: CampaignHasRunsError;
  } | null>(null);
  const elapsed = useElapsedSeconds(busy);
  // One fit at a time: a second call while one is in flight (double click, picker and build at once) is refused.
  const flight = useRef(singleFlight());

  function analyze(f: File, target?: string, nextRoles?: ColumnRolesInput, sheet?: string, replace = false) {
    return flight.current(() => runAnalysis(f, target, nextRoles, sheet, replace));
  }

  async function runAnalysis(f: File, target?: string, nextRoles?: ColumnRolesInput, sheet?: string, replace = false) {
    // A different file, or a different worksheet of the same file, is new data: the scan restarts.
    // A re-fit of the held file keeps reading the worksheet the engine used.
    const fresh = f !== file || sheet !== undefined;
    const sheetArg = sheet ?? (fresh ? undefined : (state.sheetUsed ?? undefined));
    setBusy(true);
    try {
      const d = await runFile(f, target, nextRoles, sheetArg, { replace });
      // The attempt starts once the engine has answered: a refused upload must not clear the notes on screen.
      dispatch({ type: "start" });
      if (d.error) {
        // The engine's own { error } is a problem with the sheet, not the connection. Shown as plain copy, never the raw code.
        dispatch({ type: "failure", file: f, error: engineMessage({ code: d.code, error: d.error }).message, sheets: sheetsFrom(d) });
        return;
      }
      dispatch({ type: "success", file: f, sheets: sheetsFrom(d), sheetUsed: d.sheet_used ?? null });
      // Keep a copy of the accepted sheet in this browser so the Data pages can show its rows (lib/sheet-store.ts).
      // Fire-and-forget: a browser that refuses storage (private mode) changes nothing on this page.
      void rememberSheet(f, {
        worksheet: d.sheet_used ?? sheetArg ?? null,
        engine: { target: d.target, features: d.features, n: d.n, d: d.d, dataset: d.run?.filename ?? f.name },
      }).catch(() => null);
      // Scan the worksheet the engine actually read, so the row-type check describes the fitted data.
      if (fresh) void scanSheet(f, d.sheet_used ?? sheetArg).then((r) => setScanned({ file: f, scan: r }));
    } catch (err) {
      if (err instanceof CampaignHasRunsError) {
        // Nothing was replaced: keep the current file, target and analysis, and ask first.
        setPending({ file: f, target, roles: nextRoles, sheet, refusal: err });
        return;
      }
      const copy = errorMessage(err);
      // An expired session cannot be fixed on this page: send the user to sign in, back here.
      if (copy.signIn) router.push(`/sign-in?next=${encodeURIComponent("/campaign/setup")}`);
      dispatch({ type: "failure", file: f, error: copy.message });
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
  const report = analysis?.validation;
  const next = campaignStage(latest.data ?? { has_data: false }, campaign.data ?? { has_campaign: false }).next;
  const stale = isStale(state);
  const notice = staleNotice(state, analysis?.dataset);
  const canAct = canActOnAnalysis(state);
  // The analysis on screen belongs to the dropped file only once the engine answered for it and nothing failed since.
  const builtForDropped = analysis && dropped && dropped === file && !stale && !busy ? { target: analysis.target, features: analysis.features } : null;
  // The engine refuses a re-analysis over its complete-row cap; say how close this fit is before the loop hits it.
  const roomSentence = analysis ? fitRoomSentence(fitRoom(analysis.n, analysis.run?.max_fit_rows)) : null;
  const picker = sheetSelector({ heldFile: file, heldSheets: state.sheets, sheetUsed: state.sheetUsed, failed });
  const action = nextAction(state, { hasAnalysis: !!analysis, validationFailed: report?.status === "fail" });
  const target = builtForDropped?.target ?? chosenTarget ?? undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Set up the campaign"
        description={
          <>
            Upload the <Term word="run sheet">run sheet</Term> of runs you already have, choose what to <Term word="raise">raise</Term> and what Kalos may change, then build{" "}
            <Term word="model">the model</Term>.
          </>
        }
        action={
          action.visible ? (
            <Link href={next.href} className={buttonVariants()}>
              {next.action}
              <ArrowRight />
            </Link>
          ) : null
        }
      />

      <WordsLine />

      <UploadZone onFile={(f) => { setDropped(f); setChosenTarget(null); }} disabled={busy} compact={!!dropped || !!analysis} />

      <ReplaceRunsDialog
        refusal={pending?.refusal ?? null}
        runs={campaign.data?.has_campaign ? campaign.data.pending : []}
        inputs={analysis?.features ?? (campaign.data?.has_campaign ? campaign.data.features : [])}
        target={campaign.data?.has_campaign ? campaign.data.target : (analysis?.target ?? "")}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (p) void analyze(p.file, p.target, p.roles, p.sheet, true);
        }}
      />

      {/* The one callout on this screen. A failed attempt is also the stale case (the shown analysis is the previous file's), so it carries both messages. */}
      {failed ? (
        <Callout
          tone="bad"
          title={`Kalos could not read ${failed.name}`}
          action={
            stale && file && analysis ? (
              <Button size="sm" variant="outline" onClick={() => dispatch({ type: "keepPrevious" })}>
                Keep working with {analysis.dataset}
              </Button>
            ) : undefined
          }
        >
          <p>{failed.error}</p>
          {stale && notice && !busy ? (
            <p className="mt-1 text-fg-muted">
              {notice} Nothing below belongs to {failed.name}. Its columns cannot be changed until you upload another file{file ? " or keep working with the previous one" : ""}.
            </p>
          ) : null}
        </Callout>
      ) : null}
      {picker && failed && !busy ? <SheetPicker selector={picker} busy={busy} onPick={(f, sh) => void analyze(f, undefined, undefined, sh)} /> : null}
      {busy ? <FitProgress elapsed={elapsed} rows={profile?.status === "ready" ? profile.profile.n : null} /> : null}
      {latest.status === "loading" ? <LoadingSkeleton variant="rows" rows={3} /> : null}

      {/* The decision, above the fold: read from the held file in the browser, sent to Kalos only on Build. */}
      {dropped ? (
        <ColumnChoicePanel
          key={dropped.name + dropped.size + dropped.lastModified}
          name={dropped.name}
          state={profile}
          busy={busy}
          built={builtForDropped}
          onBuild={(roles, t) => {
            setChosenTarget(t);
            void analyze(dropped, roles.target, roles);
          }}
        />
      ) : null}

      {/* The charts of the sheet, one click down: every figure comes from the file in the browser, not from the model. */}
      {dropped ? (
        <Disclosure summary="Look at the data" meta={profile?.status === "ready" ? `${formatNumber(profile.profile.n, "count")} runs, read in your browser` : undefined}>
          <div className="pt-2">
            <YourDataView
              name={dropped.name}
              state={profile}
              target={target}
              engineRuns={builtForDropped ? analysis!.n : null}
              engineInputs={builtForDropped ? analysis!.features : undefined}
            />
          </div>
        </Disclosure>
      ) : null}

      {analysis && !busy ? (
        <div className="flex flex-col gap-8" role={stale ? "group" : undefined} aria-label={stale ? "The previous sheet (not the file you just uploaded)" : undefined}>
          <div className="flex flex-col gap-2">
            {dropped && dropped !== file ? (
              <p className="text-body text-fg-muted">Everything below is still about {analysis.dataset}, the last sheet Kalos read. Build the model from {dropped.name} above to replace it.</p>
            ) : null}
            <p className="text-body text-fg">
              {analysis.dataset}: <span className="tabular-nums">{formatNumber(analysis.n, "count")}</span> runs, <span className="tabular-nums">{formatNumber(analysis.d, "count")}</span> inputs. Target{" "}
              <span className="font-mono text-code">{analysis.target}</span>; inputs {analysis.features.join(", ")}.
              {canAct && file ? "" : " From the last sheet Kalos read; upload the sheet again to change them."}
            </p>
            {roomSentence ? <p className="text-body text-fg">{roomSentence}</p> : null}
          </div>
          {picker && !failed ? <SheetPicker selector={picker} busy={busy} onPick={(f, sh) => void analyze(f, undefined, undefined, sh)} /> : null}
          <div className="flex flex-col gap-3">
            <h2 className="text-heading text-fg">{stale ? "Sheet check for the previous sheet" : "Sheet check"}</h2>
            {scan?.dataType && isMixedRowTypes(scan.dataType) && !failed ? <MixedRowsCallout counts={scan.dataType} /> : null}
            {report ? (
              <ValidationSummary report={report} valueAt={profile?.status === "ready" && dropped === file && !stale ? valueReader(profile.profile) : undefined} />
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-body text-fg-muted">Kalos read this sheet without checking it, so nothing here should be read as a pass.</p>
                <WhyLine code="no_data_check" />
              </div>
            )}
            {scan?.dataType && !isMixedRowTypes(scan.dataType) ? <RowTypeLine counts={scan.dataType} /> : null}
            {file && scan && !scan.scanned ? (
              <p className="text-caption text-fg-muted">Row types (a data_type column) could not be checked for this file (legacy .xls and files over 5 MB are not read in the browser). Check the sheet yourself for mixed measured and synthetic rows.</p>
            ) : null}
          </div>
          {/* The fitted model for this file: never shown for a previous file's analysis. */}
          {stale ? null : <TheModel analysis={analysis} />}
        </div>
      ) : null}
    </div>
  );
}

/** Reads one cell of the held sheet by column name and 0-based data row, for the sheet check's row lists. Null when the column is not in the sheet. */
function valueReader(profile: SheetProfile): (column: string, index: number) => string | null {
  return (column, index) => {
    const col = profile.columns.find((c) => c.name === column);
    if (!col) return null;
    const v = col.raw[index];
    return v == null ? null : v === "" ? "(blank)" : v;
  };
}

/** A data_type column with anything other than real or measured rows: those rows are pooled into the model. */
const isMixedRowTypes = (counts: DataTypeCounts): boolean => counts.counts.some((c) => !/^(real|measured)$/i.test(c.value));

const rowTypeList = (counts: DataTypeCounts): string => counts.counts.map((c) => `${c.value} ${formatNumber(c.n, "count")}`).join(", ");

/** Surfaces a data_type column so measured and synthetic rows are never silently pooled. Mixed sheets get the screen's callout. */
function MixedRowsCallout({ counts }: { counts: DataTypeCounts }) {
  return (
    <Callout tone="warn" title={`This sheet mixes row types (${counts.column}: ${rowTypeList(counts)})`}>
      <p>The model learns from every row. Rows that are not real measurements can make results look better than the lab would see.</p>
      <WhyLine code="mixed_row_types" />
    </Callout>
  );
}

function RowTypeLine({ counts }: { counts: DataTypeCounts }) {
  return (
    <p className="text-caption text-fg-muted">
      {counts.column}: <span className="tabular-nums">{rowTypeList(counts)}</span>.
    </p>
  );
}
