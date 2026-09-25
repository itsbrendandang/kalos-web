"use client";

import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Info, RefreshCw, ShieldAlert, SquareArrowOutUpRight, X } from "lucide-react";
import { PageHeader, Loading } from "@/components/page-header";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEMO_MODE } from "@/lib/demo";
import {
  ReadoutTargetError,
  buildReadoutTarget,
  hasPhysicsColumns,
  parseCsvHeader,
  runScaleReadout,
  type ReadoutResult,
  type ReadoutTarget,
} from "@/lib/scale-readout";

/** Columns the target/process pickers never offer as a process input - they
 *  are either the scale itself or the physics columns handled separately. */
const RESERVED_COLUMNS = new Set(["scale_L", "agitation_rpm", "airflow_L_per_min"]);

function isXlsxFile(file: File): boolean {
  return /\.(xlsx|xls)$/i.test(file.name);
}

/** Empty string -> NaN (never 0), so an untouched field reads as invalid
 *  rather than a silently accepted zero. */
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

/** How the run sheet's columns are known: parsed from a CSV/TSV header in
 *  the browser, or typed in by hand for an XLSX sheet (no parser dependency
 *  is allowed, so its columns can't be read client-side). */
type SheetMode = { kind: "none" } | { kind: "csv"; header: string[] } | { kind: "manual" };

function NumericField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
      {label}
      <Input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="font-mono text-[13px]"
      />
    </label>
  );
}

export default function ScaleReadoutPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<SheetMode>({ kind: "none" });
  const [resetCount, setResetCount] = useState(0);

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
    setResetCount((c) => c + 1);
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
      // Couldn't read the file as text - degrade to manual entry rather
      // than crash the form.
      setMode({ kind: "manual" });
    }
  }

  const manualProcessColumns = useMemo(
    () => splitNames(manualProcessRaw).filter((c) => !RESERVED_COLUMNS.has(c) && c !== targetColumn.trim()),
    [manualProcessRaw, targetColumn],
  );

  // The sheet's columns as the engine would see them - real (CSV) or
  // hand-typed (XLSX) - used only to decide whether it records both
  // physics columns (kalos/docs/SCALE_READOUT.md "Scale-only fallback").
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

  const csvProcessOptions: string[] =
    mode.kind === "csv" ? mode.header.filter((h) => !RESERVED_COLUMNS.has(h) && h !== targetColumn) : [];

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
      return { ok: false, message: e instanceof ReadoutTargetError ? e.message : "This form is not valid yet." };
    }
  }, [file, mode, effectiveHeader, targetColumn, scaleLRaw, activeProcessColumns, processValues, physicsColumns, agitationRaw, airflowRaw]);

  const canSubmit = targetAttempt.ok && !disabled;

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

  function openPrintable(html: string) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    // Give the new tab time to load the blob before revoking it.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Scale-up readout"
        title="Scale-up readout"
        desc="A data-backed prediction at a new scale, or an honest refusal with what it would take."
      />

      {DEMO_MODE ? (
        <Alert variant="default" className="items-start gap-2.5 border-amber/30 bg-amber-soft px-3.5 py-3">
          <ShieldAlert className="size-4 text-amber" aria-hidden />
          <div className="min-w-0 flex-1">
            <AlertTitle className="text-[13px] text-fg">Live engine required</AlertTitle>
            <AlertDescription className="mt-1 text-[12.5px] leading-5 text-muted">
              A readout is a decision page built from your own uploaded run sheet, so there is no honest way to
              fabricate one in demo mode. Set <code className="font-mono">NEXT_PUBLIC_DEMO_MODE=false</code> and run
              against a live Kalos engine to submit one. The form below is shown for reference and is disabled.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      {!result && !busy ? (
        <div className="flex flex-col gap-5">
          <Card>
            <SectionLabel>1. Run sheet</SectionLabel>
            <UploadDropzone key={resetCount} onFile={handleFile} disabled={disabled} />
            {file ? (
              <p className="mt-2 text-[12px] text-muted">
                <span className="font-mono font-semibold text-fg">{file.name}</span>
                {mode.kind === "manual" ? " - XLSX sheets aren't parsed in the browser, so name the columns below." : null}
              </p>
            ) : null}
          </Card>

          {mode.kind !== "none" ? (
            <Card className="flex flex-col gap-4">
              <SectionLabel>2. Target scale and process values</SectionLabel>

              {mode.kind === "csv" ? (
                <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                  Target column
                  <Select
                    value={targetColumn || undefined}
                    onValueChange={(v) => v && setTargetColumn(v)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full font-mono text-[13px]">
                      <SelectValue placeholder="Select the measured response column" />
                    </SelectTrigger>
                    <SelectContent>
                      {mode.header
                        .filter((h) => !RESERVED_COLUMNS.has(h))
                        .map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                  Target column name
                  <Input
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    placeholder="e.g. titer_g_per_L"
                    disabled={disabled}
                    className="font-mono text-[13px]"
                  />
                </label>
              )}

              {mode.kind === "csv" ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold text-muted">Process columns (planned value at the target scale)</span>
                  {csvProcessOptions.length === 0 ? (
                    <p className="text-[12px] text-muted">No process columns left in this sheet&apos;s header.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {csvProcessOptions.map((col) => {
                        const checked = checkedProcessColumns.has(col);
                        return (
                          <div key={col} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleProcessColumn(col)}
                              disabled={disabled}
                              className="size-3.5 shrink-0"
                              style={{ accentColor: "var(--blue)" }}
                            />
                            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">{col}</span>
                            {checked ? (
                              <Input
                                type="number"
                                inputMode="decimal"
                                value={processValues[col] ?? ""}
                                onChange={(e) => setProcessValues((prev) => ({ ...prev, [col]: e.target.value }))}
                                disabled={disabled}
                                placeholder="value"
                                className="h-7 w-24 shrink-0 text-right font-mono text-[12px]"
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                    Process column names (comma separated)
                    <Input
                      value={manualProcessRaw}
                      onChange={(e) => setManualProcessRaw(e.target.value)}
                      placeholder="ph_setpoint, temperature_C"
                      disabled={disabled}
                      className="font-mono text-[13px]"
                    />
                  </label>
                  {manualProcessColumns.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {manualProcessColumns.map((col) => (
                        <div key={col} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
                          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">{col}</span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={processValues[col] ?? ""}
                            onChange={(e) => setProcessValues((prev) => ({ ...prev, [col]: e.target.value }))}
                            disabled={disabled}
                            placeholder="value"
                            className="h-7 w-24 shrink-0 text-right font-mono text-[12px]"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              <NumericField label="Target scale (L)" value={scaleLRaw} onChange={setScaleLRaw} disabled={disabled} placeholder="7500" />

              {mode.kind === "manual" ? (
                <label className="flex items-center gap-2 text-[12px] text-muted">
                  <input
                    type="checkbox"
                    checked={manualHasPhysics}
                    onChange={(e) => setManualHasPhysics(e.target.checked)}
                    disabled={disabled}
                    className="size-3.5"
                    style={{ accentColor: "var(--blue)" }}
                  />
                  This sheet records agitation_rpm and airflow_L_per_min
                </label>
              ) : null}

              {physicsColumns ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumericField label="Agitation (rpm)" value={agitationRaw} onChange={setAgitationRaw} disabled={disabled} placeholder="150" />
                  <NumericField label="Airflow (L/min)" value={airflowRaw} onChange={setAirflowRaw} disabled={disabled} placeholder="300" />
                </div>
              ) : (
                <Alert variant="default" className="items-start gap-2.5 border-border bg-blue-soft px-3.5 py-3">
                  <Info className="size-4 text-muted" aria-hidden />
                  <AlertDescription className="text-[12.5px] leading-5 text-muted">
                    This sheet does not record agitation and airflow, so the engine will run a scale-only model.
                  </AlertDescription>
                </Alert>
              )}

              {!targetAttempt.ok && targetAttempt.message ? (
                <p className="text-[12.5px] text-red">{targetAttempt.message}</p>
              ) : null}

              <div>
                <Button onClick={submit} disabled={!canSubmit}>
                  {busy ? "Running readout..." : "Run scale-up readout"}
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {busy ? (
        <Card>
          <Loading label="Running scale-up readout" />
        </Card>
      ) : null}

      {result?.kind === "html" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-muted">{file?.name}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openPrintable(result.html)}>
                <SquareArrowOutUpRight />
                Open printable page
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X />
                Start a new readout
              </Button>
            </div>
          </div>
          <iframe
            srcDoc={result.html}
            sandbox=""
            title="Scale-up readout"
            className="w-full rounded-xl border border-border bg-white"
            style={{ height: "1400px" }}
          />
          <p className="text-[11px] leading-snug text-muted">Printed readouts are development decision support only.</p>
        </div>
      ) : null}

      {result?.kind === "gate" ? (
        <Alert variant="default" className="flex flex-col gap-3 border-red/30 bg-red/10 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-red">
              <AlertCircle className="size-5" />
            </span>
            <div>
              <AlertTitle className="font-head text-[16px] font-semibold text-fg">Gate check failed: {result.failedCheck}</AlertTitle>
              <AlertDescription className="mt-1 max-w-[62ch] text-[13px] leading-5 text-fg">{result.detail}</AlertDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <X />
            Try another sheet
          </Button>
        </Alert>
      ) : null}

      {result?.kind === "busy" ? (
        <Alert variant="default" className="flex flex-col items-start gap-4 border-amber/30 bg-amber-soft px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-amber">
              <AlertTriangle className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <AlertTitle className="font-head text-[16px] font-normal text-fg">Engine busy</AlertTitle>
              <AlertDescription className="mt-1 max-w-[62ch] text-[13px] leading-5 text-explore-deep">
                The engine is running another analysis; try again in{" "}
                {result.retryAfterSeconds != null ? `${result.retryAfterSeconds} s` : "a moment"}.
              </AlertDescription>
            </div>
          </div>
          <Button variant="outline" onClick={submit} disabled={busy}>
            <RefreshCw />
            Try again
          </Button>
        </Alert>
      ) : null}

      {result?.kind === "auth" ? (
        <ServiceUnavailable
          onRetry={submit}
          busy={busy}
          title="Not authorized"
          body="The engine rejected this request as unauthorized. Check the configured access token and try again."
        />
      ) : null}

      {result?.kind === "upload" ? (
        <Alert variant="default" className="flex flex-col gap-3 border-red/30 bg-red/10 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-red">
              <AlertCircle className="size-5" />
            </span>
            <div>
              <AlertTitle className="font-head text-[16px] font-semibold text-fg">Upload rejected</AlertTitle>
              <AlertDescription className="mt-1 max-w-[62ch] text-[13px] leading-5 text-fg">{result.message}</AlertDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <X />
            Try another file
          </Button>
        </Alert>
      ) : null}

      {result?.kind === "unavailable" ? (
        <ServiceUnavailable onRetry={submit} busy={busy} body={result.message} />
      ) : null}
    </div>
  );
}
