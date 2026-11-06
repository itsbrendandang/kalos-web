"use client";

import { useMemo, useState, type ReactNode } from "react";
import { PlugZap, Printer } from "lucide-react";
import { PageHeader } from "@/components/kit/page-header";
import { Verdict } from "@/components/kit/verdict";
import { Section } from "@/components/kit/section";
import { Disclosure } from "@/components/kit/disclosure";
import { UploadZone } from "@/components/campaign/upload-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import {
  ReadoutTargetError,
  buildReadoutTarget,
  hasPhysicsColumns,
  parseCsvHeader,
  runScaleReadout,
  type ReadoutResult,
  type ReadoutTarget,
} from "@/lib/scale-readout";
import { isKnownCheck, readoutVerdict } from "./readout-copy";

/** Columns the pickers never offer as a process input: the scale itself and the physics columns handled separately. */
const RESERVED_COLUMNS = new Set(["scale_L", "agitation_rpm", "airflow_L_per_min"]);

function isXlsxFile(file: File): boolean {
  return /\.(xlsx|xls)$/i.test(file.name);
}

/** Empty string -> NaN (never 0), so an untouched field reads as invalid rather than a silently accepted zero. */
function toNumber(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return Number.NaN;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

function splitNames(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** How the sheet's columns are known: parsed from a CSV/TSV header in the browser, or typed by hand for an Excel sheet. */
type SheetMode = { kind: "none" } | { kind: "csv"; header: string[] } | { kind: "manual" };

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

function NumericInput({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={className ?? "tabular-nums"}
    />
  );
}

export default function ScaleReadoutPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<SheetMode>({ kind: "none" });

  const [targetColumn, setTargetColumn] = useState("");
  const [manualProcessRaw, setManualProcessRaw] = useState("");
  const [checkedProcessColumns, setCheckedProcessColumns] = useState<Set<string>>(new Set());
  const [processValues, setProcessValues] = useState<Record<string, string>>({});
  const [scaleLRaw, setScaleLRaw] = useState("");
  const [manualHasPhysics, setManualHasPhysics] = useState(false);
  const [agitationRaw, setAgitationRaw] = useState("");
  const [airflowRaw, setAirflowRaw] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReadoutResult | null>(null);

  const disabled = busy || DEMO_MODE;

  function reset() {
    setFile(null);
    setMode({ kind: "none" });
    setTargetColumn("");
    setManualProcessRaw("");
    setCheckedProcessColumns(new Set());
    setProcessValues({});
    setScaleLRaw("");
    setManualHasPhysics(false);
    setAgitationRaw("");
    setAirflowRaw("");
    setResult(null);
  }

  async function handleFile(f: File) {
    setResult(null);
    setFile(f);
    setTargetColumn("");
    setCheckedProcessColumns(new Set());
    setProcessValues({});
    if (isXlsxFile(f)) {
      setMode({ kind: "manual" });
      return;
    }
    try {
      const text = await f.text();
      setMode({ kind: "csv", header: parseCsvHeader(text) });
    } catch {
      // Could not read the file as text: fall back to typed columns rather than fail the form.
      setMode({ kind: "manual" });
    }
  }

  const manualProcessColumns = useMemo(
    () => splitNames(manualProcessRaw).filter((c) => !RESERVED_COLUMNS.has(c) && c !== targetColumn.trim()),
    [manualProcessRaw, targetColumn],
  );

  // The sheet's columns as the engine will see them, used only to decide whether it records both physics columns.
  const effectiveHeader: string[] = useMemo(() => {
    if (mode.kind === "csv") return mode.header;
    if (mode.kind === "manual") {
      const cols = [targetColumn.trim(), ...manualProcessColumns].filter(Boolean);
      if (manualHasPhysics) cols.push("agitation_rpm", "airflow_L_per_min");
      return cols;
    }
    return [];
  }, [mode, targetColumn, manualProcessColumns, manualHasPhysics]);

  const physicsColumns = effectiveHeader.length > 0 && hasPhysicsColumns(effectiveHeader);

  const csvProcessOptions: string[] = mode.kind === "csv" ? mode.header.filter((h) => !RESERVED_COLUMNS.has(h) && h !== targetColumn) : [];

  const activeProcessColumns: string[] = useMemo(
    () => (mode.kind === "manual" ? manualProcessColumns : [...checkedProcessColumns]),
    [mode.kind, manualProcessColumns, checkedProcessColumns],
  );

  const targetAttempt = useMemo<{ ok: true; target: ReadoutTarget } | { ok: false; message: string }>(() => {
    if (!file || mode.kind === "none") return { ok: false, message: "" };
    const processParams: Record<string, number> = {};
    for (const col of activeProcessColumns) {
      processParams[col] = toNumber(processValues[col] ?? "");
    }
    try {
      const target = buildReadoutTarget({
        header: effectiveHeader,
        targetColumn: targetColumn.trim(),
        scaleL: toNumber(scaleLRaw),
        processParams,
        agitationRpm: physicsColumns ? toNumber(agitationRaw) : undefined,
        airflowLPerMin: physicsColumns ? toNumber(airflowRaw) : undefined,
      });
      return { ok: true, target };
    } catch (e) {
      return { ok: false, message: e instanceof ReadoutTargetError ? e.message : "This form is not complete yet." };
    }
  }, [file, mode, effectiveHeader, targetColumn, scaleLRaw, activeProcessColumns, processValues, physicsColumns, agitationRaw, airflowRaw]);

  const canSubmit = targetAttempt.ok && !disabled;
  const scaleL = targetAttempt.ok ? targetAttempt.target.scale_L : null;

  function toggleProcessColumn(col: string) {
    setCheckedProcessColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  async function submit() {
    if (!targetAttempt.ok || !file || disabled) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await runScaleReadout(file, targetAttempt.target);
      setResult(r);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Print the readout without a same-origin document. A text/html blob opened
   * from this origin would run with the app's origin (a blob inherits its
   * creator's), so it is never used. The readout goes into a hidden iframe
   * without same-origin permission, which gives it an opaque origin; its own
   * script (a print-on-load call, the only one added) prints that frame.
   * Scripts are allowed only so the frame can call print() itself: a parent
   * cannot call print() on a cross-origin frame.
   */
  function printReadout(html: string) {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
    frame.srcdoc = `${html}<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},0)});</script>`;
    document.body.appendChild(frame);
    // Keep the frame until the print dialog has had time to read it.
    setTimeout(() => frame.remove(), 60_000);
  }

  // After a declined readout the form stays, so the sheet or the scale can be changed and run again.
  const showForm = !busy && !DEMO_MODE && (result == null || result.kind === "gate");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Library"
        title="Scale-up readout"
        description={
          result && result.kind !== "gate"
            ? "The engine's answer for the run sheet and target scale you gave it."
            : "Ask what a recipe would do at a larger scale. The engine answers from your run sheet, or says what it would need."
        }
        action={
          result ? (
            <>
              {result.kind === "html" ? (
                <Button variant="outline" onClick={() => printReadout(result.html)}>
                  <Printer />
                  Print the readout
                </Button>
              ) : null}
              <Button variant="ghost" onClick={reset}>
                Start again
              </Button>
            </>
          ) : null
        }
      />

      {DEMO_MODE ? (
        <EmptyState
          icon={PlugZap}
          title="The readout needs the live engine"
          description="A readout is built from your own run sheet, so there is nothing honest to show with example data. Connect the engine to run one."
        />
      ) : null}

      {result?.kind === "gate" ? <ReadoutOutcome result={result} scaleL={scaleL} onRetry={() => void submit()} busy={busy} /> : null}

      {showForm ? (
        <>
          <Section
            title="Run sheet"
            description={
              <>
                One run per row, with a <span className="font-mono text-code">scale_L</span> column and the result you want predicted.
              </>
            }
          >
            <UploadZone onFile={handleFile} disabled={disabled} compact={file != null} />
            {file ? (
              <p className="text-body text-fg-muted">
                Loaded <span className="font-mono text-code text-fg">{file.name}</span>
                {mode.kind === "csv" ? ` with ${formatNumber(mode.header.length, "count")} columns.` : "."}
              </p>
            ) : null}
            {mode.kind === "manual" ? (
              <Disclosure summary="Why this sheet asks you to type its columns">
                <p className="max-w-[68ch] text-body text-fg-muted">
                  The browser cannot read an Excel file&apos;s header without a parser this app does not ship, so name the target and process
                  columns exactly as they appear in the sheet. The engine reads the file itself once it is sent.
                </p>
              </Disclosure>
            ) : null}
          </Section>

          {mode.kind !== "none" ? (
            <Section title="What to predict" description="The result column, the planned recipe, and the scale to predict it at.">
              <div className="flex max-w-xl flex-col gap-4">
                {mode.kind === "csv" ? (
                  <Field label="Result column">
                    <Select value={targetColumn || null} onValueChange={(v) => typeof v === "string" && v && setTargetColumn(v)} disabled={disabled}>
                      <SelectTrigger className="w-full font-mono text-code">
                        <SelectValue placeholder="Choose the measured result" />
                      </SelectTrigger>
                      <SelectContent>
                        {mode.header
                          .filter((h) => !RESERVED_COLUMNS.has(h))
                          .map((h) => (
                            <SelectItem key={h} value={h} className="font-mono text-code">
                              {h}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : (
                  <Field label="Result column, as named in the sheet">
                    <Input
                      value={targetColumn}
                      onChange={(e) => setTargetColumn(e.target.value)}
                      placeholder="titer_g_per_L"
                      disabled={disabled}
                      className="font-mono text-code"
                    />
                  </Field>
                )}

                {mode.kind === "csv" ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-label text-fg-muted">Process columns and their planned value at the new scale</span>
                    {csvProcessOptions.length === 0 ? (
                      <p className="text-body text-fg-muted">This sheet has no process columns left to choose.</p>
                    ) : (
                      <ul className="divide-y divide-border rounded-lg border border-border">
                        {csvProcessOptions.map((col) => {
                          const checked = checkedProcessColumns.has(col);
                          return (
                            <li key={col} className="flex items-center gap-3 px-3 py-1.5">
                              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                <Checkbox checked={checked} onChange={() => toggleProcessColumn(col)} disabled={disabled} />
                                <span className="min-w-0 flex-1 truncate font-mono text-code text-fg">{col}</span>
                              </label>
                              {checked ? (
                                <NumericInput
                                  value={processValues[col] ?? ""}
                                  onChange={(v) => setProcessValues((prev) => ({ ...prev, [col]: v }))}
                                  disabled={disabled}
                                  placeholder="value"
                                  className="h-8 w-28 shrink-0 text-right tabular-nums"
                                />
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Field label="Process columns, comma separated">
                      <Input
                        value={manualProcessRaw}
                        onChange={(e) => setManualProcessRaw(e.target.value)}
                        placeholder="ph_setpoint, temperature_C"
                        disabled={disabled}
                        className="font-mono text-code"
                      />
                    </Field>
                    {manualProcessColumns.length > 0 ? (
                      <ul className="divide-y divide-border rounded-lg border border-border">
                        {manualProcessColumns.map((col) => (
                          <li key={col} className="flex items-center gap-3 px-3 py-1.5">
                            <span className="min-w-0 flex-1 truncate font-mono text-code text-fg">{col}</span>
                            <NumericInput
                              value={processValues[col] ?? ""}
                              onChange={(v) => setProcessValues((prev) => ({ ...prev, [col]: v }))}
                              disabled={disabled}
                              placeholder="value"
                              className="h-8 w-28 shrink-0 text-right tabular-nums"
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <label className="flex cursor-pointer items-center gap-2 text-body text-fg">
                      <Checkbox checked={manualHasPhysics} onChange={(e) => setManualHasPhysics(e.target.checked)} disabled={disabled} />
                      <span>
                        The sheet records <span className="font-mono text-code">agitation_rpm</span> and{" "}
                        <span className="font-mono text-code">airflow_L_per_min</span>
                      </span>
                    </label>
                  </div>
                )}

                <Field label="Scale to predict at (L)">
                  <NumericInput value={scaleLRaw} onChange={setScaleLRaw} disabled={disabled} placeholder="2000" />
                </Field>

                {physicsColumns ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Agitation at the new scale (rpm)">
                      <NumericInput value={agitationRaw} onChange={setAgitationRaw} disabled={disabled} placeholder="150" />
                    </Field>
                    <Field label="Airflow at the new scale (L/min)">
                      <NumericInput value={airflowRaw} onChange={setAirflowRaw} disabled={disabled} placeholder="300" />
                    </Field>
                  </div>
                ) : (
                  <p className="text-body text-fg-muted">
                    This sheet does not record agitation and airflow, so the engine predicts from scale alone.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button onClick={() => void submit()} disabled={!canSubmit}>
                    Run the readout
                  </Button>
                  {!targetAttempt.ok && targetAttempt.message ? <p className="text-body text-fg-muted">{targetAttempt.message}</p> : null}
                </div>
              </div>
            </Section>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled>Run the readout</Button>
              <p className="text-body text-fg-muted">Add a run sheet first.</p>
            </div>
          )}
        </>
      ) : null}

      {busy ? <LoadingSkeleton variant="rows" rows={5} label="Running the readout" /> : null}

      {result && result.kind !== "gate" ? <ReadoutOutcome result={result} scaleL={scaleL} onRetry={() => void submit()} busy={busy} /> : null}
    </div>
  );
}

function ReadoutOutcome({ result, scaleL, onRetry, busy }: { result: ReadoutResult; scaleL: number | null; onRetry: () => void; busy: boolean }) {
  const sentence = readoutVerdict(result, scaleL);
  switch (result.kind) {
    case "html":
      return (
        <div className="flex flex-col gap-4">
          <Verdict tone="neutral">{sentence}</Verdict>
          <iframe
            srcDoc={result.html}
            sandbox=""
            title="Scale-up readout"
            className="w-full rounded-2xl border border-border bg-surface"
            style={{ height: "1400px" }}
          />
        </div>
      );
    case "gate":
      return (
        <Verdict
          tone="warn"
          detail={
            <div className="flex flex-col gap-1">
              <p>{result.detail}</p>
              <p className="text-caption">
                Check the engine named: <span className="font-mono text-code">{result.failedCheck}</span>
                {isKnownCheck(result.failedCheck) ? null : " (this page has no plain words for it yet)"}
              </p>
            </div>
          }
        >
          {sentence}
        </Verdict>
      );
    case "busy":
      return (
        <div className="flex flex-col gap-4">
          <Verdict tone="neutral">{sentence}</Verdict>
          <div>
            <Button variant="outline" onClick={onRetry} disabled={busy}>
              Try again
            </Button>
          </div>
        </div>
      );
    case "auth":
      return (
        <ErrorState
          title="The engine refused the request"
          description="It answered that this request was not authorized. Check the engine connection in Settings and try again."
          onRetry={onRetry}
          busy={busy}
        />
      );
    case "upload":
      return (
        <ErrorState
          title="The engine rejected the upload"
          description={
            <>
              <p>It could not read the file as a run sheet.</p>
              <p className="mt-1 text-caption">
                Engine detail: <span className="font-mono text-code">{result.message}</span>
              </p>
            </>
          }
        />
      );
    case "unavailable":
      return (
        <ErrorState
          title="Could not reach the engine"
          description="The readout request failed before the engine could answer. This is a connection problem, not a result."
          onRetry={onRetry}
          busy={busy}
        />
      );
  }
}
