"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, FileSpreadsheet, Loader2 } from "lucide-react";
import { SheetPicker } from "@/components/campaign/sheet-picker";
import { Section } from "@/components/kit/section";
import { Button } from "@/components/ui/button";
import { getSetup, putSetup } from "@/lib/api";
import { formatValue } from "@/lib/num";
import { columnProfiles, readSheetTable, type SheetTable } from "@/lib/sheet-columns";
import { cn } from "@/lib/utils";
import { SetupForm } from "@/components/setup/setup-form";
import { SetupError } from "@/components/setup/setup-outcome";
import { buildSetupDoc, draftFromSetup, setupErrorCopy, type DraftIssue, type SetupDraft, type SetupErrorCopy, type SetupInput } from "@/components/setup/setup-logic";

const SELECT = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-body text-fg disabled:bg-subtle disabled:text-fg-muted";

type Read = { status: "loading" } | { status: "done"; table: SheetTable | null };

/** Inputs and categoricals from the browser's read of the sheet, for a chosen target. Pure, exported for tests. */
export function setupInputsFromTable(table: Pick<SheetTable, "header" | "rows"> | null, target: string): { inputs: SetupInput[]; categoricals: string[]; targets: string[] } {
  if (!table) return { inputs: [], categoricals: [], targets: [] };
  const profiles = columnProfiles(table);
  const numeric = profiles.filter((p) => p.kind === "numeric" && p.distinct > 1);
  return {
    targets: numeric.map((p) => p.name),
    inputs: numeric.filter((p) => p.name !== target).map((p) => ({ name: p.name, observed: p.min != null && p.max != null ? [p.min, p.max] : null })),
    categoricals: profiles.filter((p) => p.kind === "text" && p.name !== target).map((p) => p.name),
  };
}

/**
 * First run, before anything is uploaded: the sheet the user picked is read in the browser, the target is
 * chosen once, then the campaign setup (goal, unit, bounds, constraints) is saved with PUT /setup and only
 * then is the upload job submitted. Before an upload the engine can only check that the bounds and
 * constraints are feasible together; it checks them against the data when it analyzes the sheet, and the
 * outcome shows on Harmonize afterwards.
 */
export function FirstRunSetup({
  campaignId,
  file,
  busy,
  onChooseAnother,
  onAnalyze,
  initialTarget,
}: {
  campaignId: string;
  file: File;
  busy: boolean;
  /** The target chosen in an earlier attempt with this page (kept when the engine refused the sheet). */
  initialTarget?: string;
  onChooseAnother: () => void;
  onAnalyze: (file: File, target: string | undefined, sheet: string | undefined) => void;
}) {
  const [sheet, setSheet] = useState<string | undefined>(undefined);
  const [read, setRead] = useState<{ key: string; read: Read }>({ key: "", read: { status: "loading" } });
  const key = `${file.name}:${file.size}:${file.lastModified}:${sheet ?? ""}`;
  const current: Read = read.key === key ? read.read : { status: "loading" };
  const [chosen, setTarget] = useState(initialTarget ?? "");
  const [draft, setDraft] = useState<SetupDraft>(() => draftFromSetup(null));
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SetupErrorCopy | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readSheetTable(file, sheet).then((table) => !cancelled && setRead({ key, read: { status: "done", table } }));
    return () => {
      cancelled = true;
    };
  }, [file, sheet, key]);

  // A setup saved by an earlier attempt (e.g. the engine refused the sheet) is offered again, not lost.
  useEffect(() => {
    let cancelled = false;
    getSetup(campaignId).then(
      (v) => !cancelled && v.source === "stored" && setDraft(draftFromSetup(v.setup)),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const table = current.status === "done" ? current.table : null;
  const { inputs, categoricals, targets } = useMemo(() => setupInputsFromTable(table, chosen), [table, chosen]);
  // A remembered target only counts when this sheet has it.
  const target = targets.includes(chosen) ? chosen : "";
  const unreadable = current.status === "done" && (!table || targets.length === 0);
  const sheets = table?.sheets ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!unreadable && !target) {
      setIssues([{ field: "target", message: "Choose the column to optimize." }]);
      return;
    }
    const built = buildSetupDoc(draft, inputs);
    if (!built.ok) {
      setIssues(built.issues);
      setNotes([]);
      return;
    }
    setIssues([]);
    setNotes(built.notes);
    setSaving(true);
    try {
      await putSetup(campaignId, built.doc);
    } catch (err) {
      setError(setupErrorCopy(err));
      setSaving(false);
      return;
    }
    setSaving(false);
    onAnalyze(file, unreadable ? undefined : target, sheet ?? (sheets.length > 1 ? table?.sheetUsed ?? undefined : undefined));
  }

  const targetIssue = issues.find((i) => i.field === "target")?.message ?? null;
  const disabled = busy || saving;
  const count = (n: number) => formatValue(n, { quantity: "count" }).text;

  return (
    <Section
      id="campaign-setup"
      title="Set up the campaign"
      description="Choose the target, the goal and any limits before Kalos analyzes the sheet. Nothing is sent until you press Save and analyze."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-3">
          <FileSpreadsheet className="size-4 text-fg-muted" aria-hidden />
          <span className="min-w-0 text-label break-all text-fg">{file.name}</span>
          {table ? (
            <span className="text-caption text-fg-muted">
              {count(table.rows.length)} rows, {count(table.header.filter(Boolean).length)} columns read by your browser
            </span>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={onChooseAnother} disabled={disabled}>
            Choose another file
          </Button>
        </div>

        {sheets.length > 1 ? (
          <SheetPicker
            selector={{ sheets, current: table?.sheetUsed ?? null, target: file }}
            busy={disabled}
            onPick={(_, s) => {
              setSheet(s);
              setTarget("");
            }}
            note="Choosing one reads that sheet; nothing is sent yet."
          />
        ) : null}

        {current.status === "loading" ? (
          <p className="flex items-center gap-2 text-body text-fg-muted" role="status">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Reading the columns of {file.name}…
          </p>
        ) : unreadable ? (
          <p className="max-w-[68ch] text-body text-fg-muted">
            Your browser could not read the columns of this file (legacy .xls, a file over 5 MB, or no numeric column was found). Kalos will suggest the target
            from the column names when it reads the sheet, and you can change it after the upload. Set the goal and unit now; bounds and constraints can be added
            on this page once the analysis exists.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 sm:max-w-sm">
            <label htmlFor="setup-target" className="text-label text-fg">
              Target: the outcome to optimize
            </label>
            <select
              id="setup-target"
              className={cn(SELECT, targetIssue && "border-bad")}
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setIssues((p) => p.filter((i) => i.field !== "target"));
              }}
              disabled={disabled}
              aria-invalid={targetIssue ? true : undefined}
              aria-describedby="setup-target-hint"
            >
              <option value="">Choose a numeric column</option>
              {targets.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <p id="setup-target-hint" role={targetIssue ? "alert" : undefined} className={cn("text-caption", targetIssue ? "text-bad" : "text-fg-muted")}>
              {targetIssue ?? "Only numeric columns are listed. The other numeric columns become the inputs Kalos may vary; you can check them after the upload."}
            </p>
          </div>
        )}

        {current.status === "done" && (unreadable || target) ? (
          <SetupForm
            value={draft}
            onChange={(d) => {
              setDraft(d);
              if (issues.length) setIssues([]);
            }}
            inputs={inputs}
            categoricals={categoricals}
            observedFrom="sheet"
            issues={issues}
            disabled={disabled}
            targetName={unreadable ? null : target}
          />
        ) : null}

        {error ? <SetupError copy={error} /> : null}
        {notes.length ? (
          <ul className="flex flex-col gap-1 text-caption text-fg-muted">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col gap-2">
          <div>
            <Button type="submit" disabled={disabled || current.status === "loading"}>
              {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {saving ? "Saving the setup..." : "Save and analyze"}
              {saving ? null : <ArrowRight aria-hidden />}
            </Button>
          </div>
          <p className="max-w-[68ch] text-caption text-fg-muted">
            The setup is saved first; the engine checks now only that the bounds and constraints can be met together. When it analyzes the sheet it checks them
            against your data and applies them, and the outcome shows on this page.
          </p>
        </div>
      </form>
    </Section>
  );
}
