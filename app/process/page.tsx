"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, FileText, Plus, Table2, Trash2, Upload, X } from "lucide-react";
import { PageHeader } from "@/components/kit/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearMap, freshMap, saveMap, useProcessMap } from "@/lib/process-store";
import {
  extractParams,
  KIND_LABEL,
  matchColumns,
  OWNER_LABEL,
  stepHealth,
  summarize,
  uid,
  type Extracted,
  type Owner,
  type ProcessMap,
  type Step,
  type StepKind,
} from "@/lib/process";
import { checkSheet, convertFactor, readSheet } from "@/lib/normalize";
import { cn } from "@/lib/utils";

const select = "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-body text-fg hover:border-fg-muted focus-visible:border-accent";

/**
 * Process: the whole workflow as a chain of steps. Each step holds its SOP, the
 * parameters read from it (confirmed by you), and data from whoever ran it,
 * in-house, a CRO or a CDMO. Today it is a place to record and check them;
 * the optimizer does not read this map yet.
 * Stored on this device only; nothing here is sent anywhere.
 */
export default function ProcessPage() {
  const { map: stored, ready } = useProcessMap();
  const map = stored;
  const [selected, setSelected] = useState<string | null>(null);

  if (!ready) return null;
  if (!map)
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Process" title="Map your whole process" description="Lay out every step from cell line to fill and finish. Add each step's SOP, and the data from whoever ran it, in-house, a CRO or a CDMO." />
        <div className="glass flex flex-col items-start gap-4 p-6">
          <p className="max-w-[56ch] text-body text-fg-muted">Start from a typical monoclonal antibody chain and edit it, or build your own. The ranges in the template are typical values to change, not recommendations.</p>
          <div className="flex gap-2">
            <Button onClick={() => saveMap(freshMap())}>Start from the antibody template</Button>
            <Button variant="outline" onClick={() => saveMap({ name: "My process", steps: [] })}>Start empty</Button>
          </div>
        </div>
      </div>
    );

  const sum = summarize(map);
  const current = map.steps.find((s) => s.id === selected) ?? null;
  const update = (m: ProcessMap) => saveMap(m);
  const patch = (id: string, f: (s: Step) => Step) => update({ ...map, steps: map.steps.map((s) => (s.id === id ? f(s) : s)) });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Process"
        title={map.name}
        description={`${sum.steps} steps, ${sum.params} parameters, data on ${sum.withData} of ${sum.steps} steps${sum.partners.length ? `. Partners: ${sum.partners.join(", ")}` : ""}.`}
        action={
          <Button
            variant="outline"
            onClick={() => {
              const id = uid("s");
              update({ ...map, steps: [...map.steps, { id, name: "New step", kind: "other", owner: "in-house", partner: "", params: [], sop: null, data: [] }] });
              setSelected(id);
            }}
          >
            <Plus /> Add step
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ol className="flex flex-col">
          {map.steps.map((s, i) => {
            const h = stepHealth(s);
            const on = s.id === selected;
            return (
              <li key={s.id} className="relative flex gap-4 pb-3">
                {i < map.steps.length - 1 ? <span className="absolute top-9 bottom-0 left-[15px] w-px bg-border-strong" aria-hidden /> : null}
                <span className={cn("z-10 mt-2.5 grid size-8 shrink-0 place-items-center rounded-full text-label tabular-nums", h.state === "ready" ? "bg-good text-bg" : "border border-border-strong bg-surface text-fg-muted")} aria-hidden>
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(on ? null : s.id)}
                  aria-pressed={on}
                  className={cn("glass flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-shadow hover:shadow-popover focus-visible:outline-2", on && "ring-2 ring-accent")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-heading text-fg">{s.name}</span>
                    <span className="block truncate text-caption text-fg-muted">
                      {KIND_LABEL[s.kind]} · {s.owner === "in-house" ? "In-house" : `${OWNER_LABEL[s.owner]}${s.partner ? `, ${s.partner}` : ""}`}
                    </span>
                  </span>
                  {s.sop ? <FileText className="size-4 text-fg-muted" role="img" aria-label="Has an SOP" /> : null}
                  <span className="text-caption tabular-nums text-fg-muted">{s.params.length} {s.params.length === 1 ? "param" : "params"}</span>
                  <Badge tone={h.state === "ready" ? "good" : "neutral"}>{h.label}</Badge>
                </button>
              </li>
            );
          })}
          {map.steps.length === 0 ? <li className="text-body text-fg-muted">No steps yet. Add the first one.</li> : null}
        </ol>

        <aside aria-label="Step details" className="h-fit lg:sticky lg:top-6">
          {current ? (
            <StepEditor key={current.id} step={current} onChange={(f) => patch(current.id, f)} onDelete={() => { update({ ...map, steps: map.steps.filter((x) => x.id !== current.id) }); setSelected(null); }} />
          ) : (
            <div className="glass p-5">
              <p className="text-heading text-fg">Pick a step</p>
              <p className="mt-1 text-body text-fg-muted">Add its SOP to read the parameters, and the data from whoever ran it. Once a step has both, you can take its data to Setup to fit a model. (The map itself is not used by the optimizer yet.)</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/graph" className={buttonVariants({ variant: "outline" })}>See the graph <ArrowRight /></Link>
                <Button variant="ghost" onClick={() => { if (window.confirm("Remove the whole process map from this device?")) clearMap(); }}>Reset</Button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function StepEditor({ step, onChange, onDelete }: { step: Step; onChange: (f: (s: Step) => Step) => void; onDelete: () => void }) {
  const [sopText, setSopText] = useState("");
  const [picks, setPicks] = useState<Record<number, boolean>>({});
  const [note, setNote] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const found = useMemo<Extracted[]>(() => (sopText.trim() ? extractParams(sopText) : []), [sopText]);
  const chosen = found.filter((_, i) => picks[i] ?? true);

  const readFile = async (file: File, kind: "sop" | "data") => {
    const lower = file.name.toLowerCase();
    if (kind === "sop") {
      if (/\.(pdf|docx?)$/.test(lower)) return setNote("PDF and Word files can't be read here yet. Copy the parameters section and paste it below.");
      setSopText(await file.text());
      setPicks({});
      onChange((s) => ({ ...s, sop: { name: file.name, added: Date.now() } }));
      setNote(null);
    } else {
      setIssues([]);
      if (/\.(xlsx?|pdf)$/.test(lower)) return setNote("Export Excel or PDF sheets to CSV first; only CSV and TSV are read here.");
      const sheet = readSheet(await file.text());
      if (!sheet) return setNote("That file needs a header row and at least one run.");
      const sum = { columns: sheet.columns, rows: sheet.rows.length };
      const reports = checkSheet(sheet.columns, sheet.rows);
      const { matched } = matchColumns(step.params, reports.map((r) => r.name));
      const findings: string[] = [];
      for (const m of matched) {
        const r = reports.find((x) => x.name === m.column);
        if (!r) continue;
        if (r.unit && m.param.unit && convertFactor(r.unit, m.param.unit) == null) findings.push(`${r.name}: sheet says ${r.unit}, the step expects ${m.param.unit}. Check the units before using it.`);
        else if (r.unit && m.param.unit && convertFactor(r.unit, m.param.unit) !== 1) findings.push(`${r.name}: sheet is in ${r.unit}; ${m.param.unit} needs a conversion (x${Number(convertFactor(r.unit, m.param.unit)!.toPrecision(4))}).`);
        else if (!r.unit && m.param.unit) findings.push(`${r.name}: the sheet gives no unit. Confirm it is ${m.param.unit}.`);
      }
      for (const r of reports) for (const i of r.issues) findings.push(`${r.name}: ${i}`);
      setIssues(findings);
      onChange((s) => ({ ...s, data: [...s.data, { name: file.name, rows: sum.rows, target: null, added: Date.now() }] }));
      setNote(`Read ${sum.rows} runs. ${matched.length} of ${step.params.length} parameters have a matching column${matched.length < step.params.length ? "; the rest will need mapping" : ""}.`);
    }
  };

  return (
    <div className="glass flex flex-col gap-5 p-5">
      <div className="flex items-start gap-2">
        <Input aria-label="Step name" value={step.name} onChange={(e) => onChange((s) => ({ ...s, name: e.target.value }))} className="text-heading" />
        <Button variant="ghost" size="icon" aria-label="Delete step" onClick={onDelete}><Trash2 /></Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-caption text-fg-muted">
          Type
          <select className={select} value={step.kind} onChange={(e) => onChange((s) => ({ ...s, kind: e.target.value as StepKind }))}>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption text-fg-muted">
          Run by
          <select className={select} value={step.owner} onChange={(e) => onChange((s) => ({ ...s, owner: e.target.value as Owner }))}>
            {Object.entries(OWNER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {step.owner !== "in-house" ? <Input aria-label="Partner name" placeholder={`${OWNER_LABEL[step.owner]} name`} value={step.partner} onChange={(e) => onChange((s) => ({ ...s, partner: e.target.value }))} className="col-span-2" /> : null}
      </div>

      <section aria-label="Parameters" className="flex flex-col gap-2">
        <h3 className="text-label text-fg">Parameters</h3>
        {step.params.length === 0 ? <p className="text-body text-fg-muted">None yet. Read them from an SOP below.</p> : null}
        <ul className="divide-y divide-border">
          {step.params.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-1.5 text-body">
              <span className="min-w-0 flex-1 truncate text-fg">{p.name}</span>
              <span className="tabular-nums text-fg-muted">{p.low === p.high ? p.low : `${p.low} to ${p.high}`} {p.unit}</span>
              {p.source === "sop" ? <Badge tone="accent">SOP</Badge> : null}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange((s) => ({ ...s, params: s.params.filter((x) => x.id !== p.id) }))} className="text-fg-muted hover:text-fg"><X className="size-4" /></button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="SOP" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-label text-fg">SOP {step.sop ? <span className="font-normal text-fg-muted">· {step.sop.name}</span> : null}</h3>
          <FilePick label="Upload" accept=".txt,.md,.csv,.pdf,.doc,.docx" onFile={(f) => readFile(f, "sop")} icon={<Upload />} />
        </div>
        <textarea aria-label="SOP text" value={sopText} onChange={(e) => { setSopText(e.target.value); setPicks({}); }} placeholder="Paste the parameters section of the SOP, one per line. For example: pH 6.8 - 7.2" rows={4} className="rounded-lg border border-border-strong bg-surface p-3 text-body text-fg placeholder:text-fg-muted hover:border-fg-muted focus-visible:border-accent" />
        {found.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-caption text-fg-muted">Found {found.length}. Untick any that are wrong, then add. Lines it could not read are skipped.</p>
            <ul className="flex flex-col gap-1">
              {found.map((f, i) => (
                <li key={i}>
                  <label className="flex items-center gap-2 text-body">
                    <input type="checkbox" checked={picks[i] ?? true} onChange={(e) => setPicks({ ...picks, [i]: e.target.checked })} className="size-4 accent-[var(--accent)]" />
                    <span className="min-w-0 flex-1 truncate text-fg">{f.name}</span>
                    <span className="tabular-nums text-fg-muted">{f.low === f.high ? f.low : `${f.low} to ${f.high}`} {f.unit}</span>
                  </label>
                </li>
              ))}
            </ul>
            <Button
              disabled={!chosen.length}
              onClick={() => {
                onChange((s) => ({ ...s, params: [...s.params, ...chosen.map((c) => ({ id: uid("p"), name: c.name, unit: c.unit, low: c.low, high: c.high, source: "sop" as const }))] }));
                setSopText("");
                setPicks({});
              }}
            >
              Add {chosen.length} parameter{chosen.length === 1 ? "" : "s"}
            </Button>
          </div>
        ) : sopText.trim() ? <p className="text-caption text-fg-muted">No parameters found. Lines like “pH 6.8 - 7.2” or “Temperature: 36.5 ± 0.5 °C” are read.</p> : null}
      </section>

      <section aria-label="Data" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-label text-fg">Data{step.owner !== "in-house" ? ` from ${step.partner || OWNER_LABEL[step.owner]}` : ""}</h3>
          <FilePick label="Add sheet" accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf" onFile={(f) => readFile(f, "data")} icon={<Table2 />} />
        </div>
        {step.data.length === 0 ? <p className="text-body text-fg-muted">No sheets yet. A CSV of runs, one row each, works.</p> : null}
        <ul className="divide-y divide-border">
          {step.data.map((d, i) => (
            <li key={i} className="flex items-center gap-2 py-1.5 text-body">
              <span className="min-w-0 flex-1 truncate text-fg">{d.name}</span>
              <span className="tabular-nums text-fg-muted">{d.rows} runs</span>
              <button type="button" aria-label={`Remove ${d.name}`} onClick={() => onChange((s) => ({ ...s, data: s.data.filter((_, j) => j !== i) }))} className="text-fg-muted hover:text-fg"><X className="size-4" /></button>
            </li>
          ))}
        </ul>
        {note ? <p role="status" className="text-caption text-fg-muted">{note}</p> : null}
        {issues.length ? (
          <div className="rounded-xl bg-subtle p-3">
            <p className="text-label text-fg">Check before using this sheet</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-caption text-fg-muted">{issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        ) : null}
        {step.data.length ? <Link href="/campaign/setup" className={buttonVariants({ variant: "outline" })}>Open Setup <ArrowRight /></Link> : null}
        <p className="text-caption text-fg-muted">Sheets are read on this device. Only the header and row count are kept here.</p>
      </section>
    </div>
  );
}

function FilePick({ label, accept, onFile, icon }: { label: string; accept: string; onFile: (f: File) => void; icon: React.ReactNode }) {
  return (
    <label className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer focus-within:ring-2 focus-within:ring-accent")}>
      {icon}
      {label}
      <input type="file" accept={accept} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </label>
  );
}
