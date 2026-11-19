"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import { ElapsedProgress } from "@/components/kit/job-progress";
import { Panel } from "@/components/kit/section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GateRefusalView, ReadoutProblem, ReadoutReport } from "@/components/scale/readout-result";
import { SheetDrop } from "@/components/scale/sheet-drop";
import {
  ReadoutTargetError,
  buildReadoutTarget,
  hasPhysicsColumns,
  runScaleReadout,
  type ReadoutResult,
  type ReadoutTarget,
} from "@/lib/scale-readout";
import { scanSheet } from "@/lib/sheet-columns";

/** Columns never offered as the response or a process input: the scale itself and the two physics columns. */
const RESERVED_COLUMNS = new Set(["scale_L", "agitation_rpm", "airflow_L_per_min"]);

/** Empty string -> NaN (never 0), so an untouched field reads as missing rather than a silently accepted zero. */
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

/** How the sheet's columns are known: read in the browser (CSV, TSV, .xlsx), or typed in by hand
 *  when the browser cannot read the file (legacy .xls, or a file it could not parse). */
type SheetMode = { kind: "none" } | { kind: "scanning" } | { kind: "read"; header: string[] } | { kind: "manual" };

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-label text-fg">{label}</span>
      {children}
      {hint ? <span className="text-caption text-fg-muted">{hint}</span> : null}
    </label>
  );
}

function NumberInput({ value, onChange, placeholder, ariaLabel, className }: { value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel?: string; className?: string }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className ?? "tabular-nums"}
    />
  );
}

export function ReadoutTool() {
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

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<ReadoutResult | null>(null);
  const busy = startedAt != null;

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
    setMode({ kind: "scanning" });
    const scan = await scanSheet(f);
    setMode(scan.columns.length > 0 ? { kind: "read", header: scan.columns } : { kind: "manual" });
  }

  const manualProcessColumns = useMemo(
    () => splitNames(manualProcessRaw).filter((c) => !RESERVED_COLUMNS.has(c) && c !== targetColumn.trim()),
    [manualProcessRaw, targetColumn],
  );

  // The sheet's columns as the engine will see them (read, or typed by hand), used only to decide whether it
  // records both physics columns (kalos-engine docs/SCALE_READOUT.md "Scale-only fallback").
  const effectiveHeader: string[] = useMemo(() => {
    if (mode.kind === "read") return mode.header;
    if (mode.kind === "manual") {
      const cols = [targetColumn.trim(), ...manualProcessColumns].filter(Boolean);
      if (manualHasPhysics) cols.push("agitation_rpm", "airflow_L_per_min");
      return cols;
    }
    return [];
  }, [mode, targetColumn, manualProcessColumns, manualHasPhysics]);

  const physicsColumns = effectiveHeader.length > 0 && hasPhysicsColumns(effectiveHeader);
  const hasScaleColumn = mode.kind !== "read" || mode.header.includes("scale_L");

  const processOptions: string[] = mode.kind === "read" ? mode.header.filter((h) => !RESERVED_COLUMNS.has(h) && h !== targetColumn) : [];

  const activeProcessColumns: string[] = useMemo(
    () => (mode.kind === "manual" ? manualProcessColumns : [...checkedProcessColumns].filter((c) => c !== targetColumn)),
    [mode.kind, manualProcessColumns, checkedProcessColumns, targetColumn],
  );

  const targetAttempt = useMemo<{ ok: true; target: ReadoutTarget } | { ok: false; message: string }>(() => {
    if (!file || (mode.kind !== "read" && mode.kind !== "manual")) return { ok: false, message: "" };
    const processParams: Record<string, number> = {};
    for (const col of activeProcessColumns) processParams[col] = toNumber(processValues[col] ?? "");
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
      return { ok: false, message: e instanceof ReadoutTargetError ? e.message : "The form is not complete yet." };
    }
  }, [file, mode, effectiveHeader, targetColumn, scaleLRaw, activeProcessColumns, processValues, physicsColumns, agitationRaw, airflowRaw]);

  function toggleProcessColumn(col: string) {
    setCheckedProcessColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  async function submit() {
    if (!targetAttempt.ok || !file || busy) return;
    setResult(null);
    setStartedAt(Date.now());
    try {
      setResult(await runScaleReadout(file, targetAttempt.target));
    } finally {
      setStartedAt(null);
    }
  }

  const editInputs = () => setResult(null);

  if (busy) {
    return (
      <ElapsedProgress
        title="Running the scale-up readout"
        note="The engine backtests itself on your scale ladder in a single request and reports no stages, so only the elapsed time is shown. Keep this page open until it answers."
        startedAt={startedAt}
      />
    );
  }

  if (result) {
    if (result.kind === "html") return <ReadoutReport html={result.html} fileName={file?.name ?? null} onEdit={editInputs} onReset={reset} />;
    if (result.kind === "gate") return <GateRefusalView failedCheck={result.failedCheck} detail={result.detail} onEdit={editInputs} onReset={reset} />;
    return <ReadoutProblem result={result} onRetry={submit} onEdit={editInputs} onReset={reset} />;
  }

  const ready = mode.kind === "read" || mode.kind === "manual";

  return (
    <Panel className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-heading text-fg">Run sheet</h3>
        <SheetDrop file={file} onFile={handleFile} />
        {mode.kind === "scanning" ? <p className="text-caption text-fg-muted">Reading the column names...</p> : null}
        {mode.kind === "manual" ? (
          <p className="text-caption text-fg-muted">This file&apos;s columns could not be read in the browser, so type the column names below. The engine reads the file itself.</p>
        ) : null}
        {mode.kind === "read" && !hasScaleColumn ? (
          <p className="text-caption text-fg">
            This sheet has no <span className="font-mono text-code">scale_L</span> column. The engine needs each run&apos;s vessel volume in litres
            under that name, so it will refuse the sheet as it is.
          </p>
        ) : null}
      </div>

      {ready ? (
        <>
          <div className="grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
            {mode.kind === "read" ? (
              <Field label="Measured response to predict">
                <Select value={targetColumn || null} onValueChange={(v) => setTargetColumn(typeof v === "string" ? v : "")}>
                  <SelectTrigger className="w-full font-mono text-code" aria-label="Measured response to predict">
                    <SelectValue placeholder="Choose a column" />
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
              <Field label="Measured response to predict" hint="The column name exactly as in the sheet.">
                <Input value={targetColumn} onChange={(e) => setTargetColumn(e.target.value)} placeholder="titer_g_per_L" className="font-mono text-code" />
              </Field>
            )}
            <Field label="Target scale (L)" hint="Larger than every scale in the sheet.">
              <NumberInput value={scaleLRaw} onChange={setScaleLRaw} placeholder="e.g. 50" />
            </Field>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <div>
              <h3 className="text-heading text-fg">Planned process settings at the target scale</h3>
              <p className="mt-0.5 text-body text-fg-muted">
                Pick the process columns the model should use and enter the value you plan to run at the new scale.
              </p>
            </div>
            {mode.kind === "read" ? (
              processOptions.length === 0 ? (
                <p className="text-body text-fg-muted">No other columns in this sheet&apos;s header.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {processOptions.map((col) => {
                    const checked = checkedProcessColumns.has(col);
                    return (
                      <li key={col} className="flex h-12 items-center gap-2 rounded-lg border border-border px-3">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <Checkbox checked={checked} onChange={() => toggleProcessColumn(col)} />
                          <span className="min-w-0 flex-1 truncate font-mono text-code text-fg">{col}</span>
                        </label>
                        {checked ? (
                          <NumberInput
                            value={processValues[col] ?? ""}
                            onChange={(v) => setProcessValues((prev) => ({ ...prev, [col]: v }))}
                            placeholder="value"
                            ariaLabel={`Planned ${col}`}
                            className="h-8 w-28 shrink-0 text-right tabular-nums"
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              <>
                <Field label="Process column names" hint="Comma separated, exactly as in the sheet.">
                  <Input value={manualProcessRaw} onChange={(e) => setManualProcessRaw(e.target.value)} placeholder="ph_setpoint, temperature_C" className="font-mono text-code" />
                </Field>
                {manualProcessColumns.length > 0 ? (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {manualProcessColumns.map((col) => (
                      <li key={col} className="flex h-12 items-center gap-2 rounded-lg border border-border px-3">
                        <span className="min-w-0 flex-1 truncate font-mono text-code text-fg">{col}</span>
                        <NumberInput
                          value={processValues[col] ?? ""}
                          onChange={(v) => setProcessValues((prev) => ({ ...prev, [col]: v }))}
                          placeholder="value"
                          ariaLabel={`Planned ${col}`}
                          className="h-8 w-28 shrink-0 text-right tabular-nums"
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-6">
            {mode.kind === "manual" ? (
              <label className="flex cursor-pointer items-center gap-2 text-body text-fg">
                <Checkbox checked={manualHasPhysics} onChange={(e) => setManualHasPhysics(e.target.checked)} />
                The sheet records both <span className="font-mono text-code">agitation_rpm</span> and{" "}
                <span className="font-mono text-code">airflow_L_per_min</span>
              </label>
            ) : null}
            {physicsColumns ? (
              <>
                <p className="text-body text-fg-muted">
                  The sheet records agitation and airflow, so the engine models mixing and oxygen transfer and needs the planned values.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Agitation (rpm)">
                    <NumberInput value={agitationRaw} onChange={setAgitationRaw} placeholder="e.g. 150" />
                  </Field>
                  <Field label="Airflow (L/min)">
                    <NumberInput value={airflowRaw} onChange={setAirflowRaw} placeholder="e.g. 3" />
                  </Field>
                </div>
              </>
            ) : (
              <p className="text-body text-fg-muted">
                The sheet does not record both agitation and airflow, so the engine will use its scale-only model: it accounts for volume and
                hydrostatic pressure but not mixing or oxygen transfer.
              </p>
            )}
          </div>
        </>
      ) : null}

      {ready ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <Button onClick={submit} disabled={!targetAttempt.ok}>
            <Play />
            Run the readout
          </Button>
          {!targetAttempt.ok && targetAttempt.message ? <p className="text-body text-fg-muted">{targetAttempt.message}</p> : null}
        </div>
      ) : null}
    </Panel>
  );
}
