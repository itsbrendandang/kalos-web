"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { RefusalBlock } from "@/components/viz/refusal";
import { exportRowsCsv, exportRowsJson, type RowsExport } from "@/lib/api";
import { displayRound } from "@/lib/campaign-stage";
import { formatValue } from "@/lib/num";
import { packageFilename, rawRowsMeta } from "@/lib/report-package";
import { engineDetail, unavailableFrom, type Read } from "@/components/report/report-data";
import { saveBlob } from "@/components/report/save-file";

const count = (n: number | null | undefined) => formatValue(n, { quantity: "count" }).text;
const rows = (n: number | null | undefined) => `${count(n)} ${n === 1 ? "row" : "rows"}`;

/** Refusals the engine gives for this export, with what would fix each (ENGINE_API_V2 section 9). */
const REFUSED: Record<string, { title: string; fix: string | null }> = {
  anonymized_export_unavailable: {
    title: "Export refused to protect anonymized names",
    fix: "Re-analyze the campaign so the engine records its anonymization again, then export. If it repeats, ask your administrator.",
  },
  export_too_large: { title: "Export too large", fix: "Ask your administrator for a direct database export; the engine caps one response at 2,000,000 cells." },
  no_data: { title: "No data to export", fix: "Upload a run sheet on Harmonize first." },
};

/** Rows folded in after the upload, per engine round (as counted in the engine's own rows list). */
function foldedByRound(r: RowsExport): { round: number; n: number }[] {
  const by = new Map<number, number>();
  for (const row of r.folded_rows?.rows ?? []) {
    if (typeof row.folded_in_round !== "number") continue;
    by.set(row.folded_in_round, (by.get(row.folded_in_round) ?? 0) + 1);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([round, n]) => ({ round, n }));
}

/**
 * Raw data as uploaded plus the results folded in later, from the engine's
 * rows export: how many rows came from the original upload and how many were
 * folded in by later rounds, whether the engine could tell them apart, and
 * whether names are anonymized. The two downloads are the engine's own files.
 */
export function RawDataSection({ campaignId, campaignName, read }: { campaignId: string; campaignName: string; read: Read<RowsExport> & { reload: () => void } }) {
  return (
    <Section
      id="raw-data"
      title="Raw data (as uploaded + folded results)"
      description="The rows the model was fitted to, as the engine exports them: the original upload and the measured results folded in by later rounds."
    >
      {read.status === "loading" ? (
        <LoadingSkeleton rows={3} label="Reading the rows export" />
      ) : read.status === "unavailable" ? (
        REFUSED[read.code] ? (
          <RefusalBlock
            title={REFUSED[read.code].title}
            reasons={[read.reason]}
            fix={REFUSED[read.code].fix ? [REFUSED[read.code].fix!] : undefined}
            footer={read.detail ? `Engine: ${read.detail}` : undefined}
          />
        ) : (
          <ErrorState title="Could not read the raw data export" description={`${read.reason} Nothing was exported.`} onRetry={read.reload} />
        )
      ) : (
        <RawData data={read.data} campaignId={campaignId} campaignName={campaignName} />
      )}
    </Section>
  );
}

function RawData({ data, campaignId, campaignName }: { data: RowsExport; campaignId: string; campaignName: string }) {
  const meta = rawRowsMeta(data);
  const folded = foldedByRound(data);
  const [busy, setBusy] = useState<"csv" | "json" | null>(null);
  const [failure, setFailure] = useState<{ reason: string; detail: string | null } | null>(null);

  const download = async (kind: "csv" | "json") => {
    setBusy(kind);
    setFailure(null);
    try {
      if (kind === "csv") {
        const { blob, filename } = await exportRowsCsv(campaignId);
        saveBlob(filename ?? packageFilename(campaignName, "rows", new Date()), blob);
      } else {
        const fresh = await exportRowsJson(campaignId);
        saveBlob(packageFilename(campaignName, "rows-json", new Date()), new Blob([`${JSON.stringify(fresh, null, 2)}\n`], { type: "application/json" }));
      }
    } catch (err) {
      setFailure({ reason: unavailableFrom(err).reason, detail: engineDetail(err) });
    } finally {
      setBusy(null);
    }
  };

  if (!data.has_data) return <p className="text-body text-fg-muted">The engine has no data rows for this campaign yet.</p>;

  const anonymized = data.anonymization?.applied === true;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
        {meta.original_rows_identifiable ? (
          <>
            <div>
              <dt className="text-label text-fg-muted">Original upload</dt>
              <dd className="text-title font-semibold text-fg tabular-nums">{count(meta.n_original_rows)}</dd>
              <dd className="text-caption text-fg-muted">rows as uploaded</dd>
            </div>
            <div>
              <dt className="text-label text-fg-muted">Folded in later</dt>
              <dd className="text-title font-semibold text-fg tabular-nums">{count(meta.n_folded_rows)}</dd>
              <dd className="text-caption text-fg-muted tabular-nums">
                {folded.length
                  ? folded.map((f) => `${rows(f.n)} in round ${count(displayRound(f.round))}`).join(", ")
                  : "measured results from later rounds; none yet"}
              </dd>
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <dt className="text-label text-fg-muted">Rows, not attributed</dt>
            <dd className="text-title font-semibold text-fg tabular-nums">{count(meta.n_unattributed_rows)}</dd>
            <dd className="text-caption text-fg-muted">
              The engine could not tell which rows came from the original upload
              {meta.original_rows_reason ? <>: {meta.original_rows_reason}</> : "."} Every row is listed as unattributed; nothing is guessed.
            </dd>
          </div>
        )}
        <div>
          <dt className="text-label text-fg-muted">Names</dt>
          <dd className="text-body text-fg">{anonymized ? "Anonymized" : "Not anonymized"}</dd>
          <dd className="text-caption text-fg-muted">
            {anonymized
              ? "Columns and identifier levels use the same aliases as the analysis."
              : "Column names and values exactly as in the sheet."}
          </dd>
        </div>
      </dl>
      <p className="text-body text-fg-muted">
        {count(meta.columns.length)} columns{meta.target ? <>, target <span className="font-mono text-code text-fg">{meta.target}</span></> : null}. The CSV is
        built by the engine: text cells that a spreadsheet would run as a formula (starting with = + − @, a tab or a line break) get a leading apostrophe, and
        numbers are left untouched. Each export, including the read this page makes to count the rows, is recorded in the audit log.
      </p>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="outline" onClick={() => void download("csv")} disabled={busy != null}>
          {busy === "csv" ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download aria-hidden />}
          Raw rows (engine CSV)
        </Button>
        <Button variant="outline" onClick={() => void download("json")} disabled={busy != null}>
          {busy === "json" ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download aria-hidden />}
          Raw rows (engine JSON)
        </Button>
      </div>
      {failure ? (
        <p role="alert" className="text-body text-fg">
          {failure.reason} Nothing was downloaded.
          {failure.detail ? <span className="block text-caption text-fg-muted">Engine: {failure.detail}</span> : null}
        </p>
      ) : null}
      <Disclosure summary="Export provenance, as the engine sent it">
        <pre className="max-h-80 overflow-auto rounded-lg bg-subtle p-3 font-mono text-caption break-all whitespace-pre-wrap text-fg">
          {JSON.stringify({ provenance: meta.provenance, anonymization: meta.anonymization, csv_formula_neutralization: meta.csv_formula_neutralization }, null, 2)}
        </pre>
      </Disclosure>
    </div>
  );
}
