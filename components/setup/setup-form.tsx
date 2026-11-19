"use client";

import { useId, type ReactNode } from "react";
import { Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Goal } from "@/lib/api";
import { formatSetting, formatValue } from "@/lib/num";
import { cn } from "@/lib/utils";
import {
  boundField,
  constraintField,
  emptyConstraint,
  MAX_CONSTRAINTS,
  MAX_TERMS,
  UNIT_MAX,
  type ConstraintDraft,
  type DraftIssue,
  type SetupDraft,
  type SetupInput,
} from "@/components/setup/setup-logic";

const SELECT = "h-9 rounded-lg border border-border-strong bg-surface px-2 text-body text-fg disabled:bg-subtle disabled:text-fg-muted";

/**
 * The campaign setup form: goal, target unit, a bound per continuous input (with its observed range next to
 * it) and linear constraints. Controlled: the parent holds the draft and decides when to PUT it. Used before
 * the first upload (observed ranges read from the sheet in the browser) and on a seeded campaign (observed
 * and effective ranges from the engine's GET /setup bounds_report).
 */
export function SetupForm({
  value,
  onChange,
  inputs,
  categoricals,
  observedFrom,
  issues,
  disabled = false,
  targetName,
}: {
  value: SetupDraft;
  onChange: (next: SetupDraft) => void;
  inputs: readonly SetupInput[];
  /** Categorical inputs: linear constraints are refused by the engine when there is any. */
  categoricals: readonly string[];
  /** Who measured the observed ranges: the browser reading the sheet, or the engine's analysis. */
  observedFrom: "sheet" | "engine";
  issues: readonly DraftIssue[];
  disabled?: boolean;
  targetName: string | null;
}) {
  const id = useId();
  const issue = (field: string) => issues.find((i) => i.field === field)?.message ?? null;
  const set = (patch: Partial<SetupDraft>) => onChange({ ...value, ...patch });
  const target = targetName ? <span className="font-mono text-code text-fg">{targetName}</span> : "the target";

  return (
    <div className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="text-label text-fg">Goal</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          {(["maximize", "minimize"] as Goal[]).map((g) => (
            <label key={g} className="flex items-start gap-2 text-body text-fg">
              <input type="radio" name={`${id}-goal`} className="mt-1 accent-accent" checked={value.goal === g} onChange={() => set({ goal: g })} />
              <span>
                {g === "maximize" ? "Maximize" : "Minimize"} {target}
                <span className="block text-caption text-fg-muted">
                  {g === "maximize" ? "Kalos proposes recipes expected to raise it." : "Kalos proposes recipes expected to lower it (for example an impurity or a cost)."}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <label htmlFor={`${id}-unit`} className="text-label text-fg">
          Target unit <span className="font-normal text-fg-muted">(optional)</span>
        </label>
        <Input
          id={`${id}-unit`}
          value={value.unit}
          onChange={(e) => set({ unit: e.target.value })}
          placeholder="e.g. g/L"
          autoComplete="off"
          maxLength={UNIT_MAX * 2}
          disabled={disabled}
          aria-invalid={issue("unit") ? true : undefined}
          aria-describedby={`${id}-unit-hint`}
        />
        <FieldHint id={`${id}-unit-hint`} error={issue("unit")}>
          A display label only: values are never converted. Up to {UNIT_MAX} characters. Left blank, the unit is read from the column header when it states one.
        </FieldHint>
      </div>

      <BoundsTable value={value} onChange={onChange} inputs={inputs} observedFrom={observedFrom} issue={issue} disabled={disabled} />

      <ConstraintsEditor value={value} onChange={onChange} inputs={inputs} categoricals={categoricals} issue={issue} disabled={disabled} />
    </div>
  );
}

function FieldHint({ id, error, children }: { id?: string; error: string | null; children?: ReactNode }) {
  if (!error && !children) return null;
  return (
    <p id={id} role={error ? "alert" : undefined} className={cn("text-caption", error ? "text-bad" : "text-fg-muted")}>
      {error ?? children}
    </p>
  );
}

function BoundsTable({
  value,
  onChange,
  inputs,
  observedFrom,
  issue,
  disabled,
}: {
  value: SetupDraft;
  onChange: (next: SetupDraft) => void;
  inputs: readonly SetupInput[];
  observedFrom: "sheet" | "engine";
  issue: (field: string) => string | null;
  disabled: boolean;
}) {
  const setBound = (f: string, end: "lo" | "hi", v: string) => {
    const cur = value.bounds[f] ?? { lo: "", hi: "" };
    onChange({ ...value, bounds: { ...value.bounds, [f]: { ...cur, [end]: v } } });
  };
  const bad = issue("bounds");
  return (
    <section aria-labelledby="setup-bounds-title" className="flex flex-col gap-2">
      <div>
        <h3 id="setup-bounds-title" className="text-label text-fg">
          Bounds <span className="font-normal text-fg-muted">(optional)</span>
        </h3>
        <p className="mt-0.5 max-w-[68ch] text-caption text-fg-muted">
          A bound narrows where Kalos may propose recipes. It never widens the search beyond your data: Kalos does not extrapolate, so a bound past the
          observed range is applied only up to the observed value. Leave an end blank to keep the observed value there.
          {observedFrom === "sheet"
            ? " Observed ranges here are read from the sheet by your browser; the engine recomputes them from the rows it fits."
            : " Observed ranges are the engine's, from the current analysis."}
        </p>
      </div>
      {inputs.length === 0 ? (
        <p className="text-body text-fg-muted">There is no numeric input to bound.</p>
      ) : (
        <Table containerClassName="max-h-[480px] rounded-xl border border-border">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-surface">Input</TableHead>
              <TableHead numeric className="bg-surface">
                Observed
              </TableHead>
              <TableHead className="bg-surface">Low</TableHead>
              <TableHead className="bg-surface">High</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inputs.map((inp) => {
              const b = value.bounds[inp.name] ?? { lo: "", hi: "" };
              const err = issue(boundField(inp.name));
              const obs = inp.observed;
              const fmt = (v: number) => formatSetting(v, obs).text;
              return (
                <TableRow key={inp.name} className="align-top">
                  <TableCell className="font-mono text-code text-fg">
                    {inp.name}
                    {err ? (
                      <p role="alert" className="mt-1 max-w-[28ch] font-sans text-caption whitespace-normal text-bad">
                        {err}
                      </p>
                    ) : inp.effective && (b.lo !== "" || b.hi !== "") ? (
                      <p className="mt-1 max-w-[28ch] font-sans text-caption whitespace-normal text-fg-muted">
                        Searched: {fmt(inp.effective[0])} to {fmt(inp.effective[1])}
                        {inp.extrapolates ? " (your bound reaches past the data; applied only within it)" : ""}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell numeric className="text-fg-muted">
                    {obs ? `${fmt(obs[0])} to ${fmt(obs[1])}` : "n/a"}
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      aria-label={`Low bound for ${inp.name}`}
                      value={b.lo}
                      onChange={(e) => setBound(inp.name, "lo", e.target.value)}
                      disabled={disabled}
                      aria-invalid={err ? true : undefined}
                      className="w-28 tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      aria-label={`High bound for ${inp.name}`}
                      value={b.hi}
                      onChange={(e) => setBound(inp.name, "hi", e.target.value)}
                      disabled={disabled}
                      aria-invalid={err ? true : undefined}
                      className="w-28 tabular-nums"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <FieldHint error={bad} />
    </section>
  );
}

function ConstraintsEditor({
  value,
  onChange,
  inputs,
  categoricals,
  issue,
  disabled,
}: {
  value: SetupDraft;
  onChange: (next: SetupDraft) => void;
  inputs: readonly SetupInput[];
  categoricals: readonly string[];
  issue: (field: string) => string | null;
  disabled: boolean;
}) {
  const setConstraint = (i: number, c: ConstraintDraft) => onChange({ ...value, constraints: value.constraints.map((x, j) => (j === i ? c : x)) });
  const remove = (i: number) => onChange({ ...value, constraints: value.constraints.filter((_, j) => j !== i) });
  const count = (n: number) => formatValue(n, { quantity: "count" }).text;
  return (
    <section aria-labelledby="setup-constraints-title" className="flex flex-col gap-3">
      <div>
        <h3 id="setup-constraints-title" className="text-label text-fg">
          Linear constraints <span className="font-normal text-fg-muted">(optional)</span>
        </h3>
        <p className="mt-0.5 max-w-[68ch] text-caption text-fg-muted">
          A rule every proposed recipe must meet, such as glucose plus glycerol at most 12. Each proposal is checked against the bounds and constraints; one that
          breaks them is dropped and counted.
        </p>
      </div>
      {categoricals.length > 0 ? (
        <p className="flex max-w-[68ch] items-start gap-2 text-caption text-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <span>
            This sheet has a categorical input ({categoricals.join(", ")}). The engine&apos;s optimizer does not support linear constraints together with categorical
            inputs, so with any constraint here it withholds every proposal rather than ignore the rule. Bounds still work.
          </span>
        </p>
      ) : null}
      {value.constraints.map((c, i) => (
        <ConstraintRow
          key={c.key}
          index={i}
          value={c}
          inputs={inputs}
          onChange={(next) => setConstraint(i, next)}
          onRemove={() => remove(i)}
          error={issue(constraintField(i))}
          disabled={disabled}
        />
      ))}
      <FieldHint error={issue("constraints")} />
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || inputs.length === 0 || value.constraints.length >= MAX_CONSTRAINTS}
          onClick={() => onChange({ ...value, constraints: [...value.constraints, emptyConstraint()] })}
        >
          <Plus aria-hidden />
          Add a constraint
        </Button>
        {value.constraints.length >= MAX_CONSTRAINTS ? (
          <span className="ml-3 text-caption text-fg-muted">The engine accepts at most {count(MAX_CONSTRAINTS)} constraints.</span>
        ) : null}
      </div>
    </section>
  );
}

function ConstraintRow({
  index,
  value,
  inputs,
  onChange,
  onRemove,
  error,
  disabled,
}: {
  index: number;
  value: ConstraintDraft;
  inputs: readonly SetupInput[];
  onChange: (c: ConstraintDraft) => void;
  onRemove: () => void;
  error: string | null;
  disabled: boolean;
}) {
  const n = index + 1;
  const setTerm = (j: number, patch: Partial<ConstraintDraft["terms"][number]>) =>
    onChange({ ...value, terms: value.terms.map((t, k) => (k === j ? { ...t, ...patch } : t)) });
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-tight" disabled={disabled} aria-label={`Constraint ${n}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {value.terms.map((t, j) => (
          <span key={j} className="flex items-center gap-1.5">
            {j > 0 ? <span className="text-body text-fg-muted">+</span> : null}
            <Input
              inputMode="decimal"
              aria-label={`Constraint ${n}, coefficient ${j + 1}`}
              value={t.coef}
              onChange={(e) => setTerm(j, { coef: e.target.value })}
              className="w-16 tabular-nums"
            />
            <span className="text-body text-fg-muted" aria-hidden>
              ×
            </span>
            <select aria-label={`Constraint ${n}, input ${j + 1}`} className={cn(SELECT, "max-w-[12rem]")} value={t.feature} onChange={(e) => setTerm(j, { feature: e.target.value })}>
              <option value="">Choose an input</option>
              {inputs.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name}
                </option>
              ))}
            </select>
            {value.terms.length > 1 ? (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove term ${j + 1} of constraint ${n}`}
                onClick={() => onChange({ ...value, terms: value.terms.filter((_, k) => k !== j) })}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </span>
        ))}
        {value.terms.length < MAX_TERMS ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...value, terms: [...value.terms, { feature: "", coef: "1" }] })}>
            <Plus aria-hidden />
            Term
          </Button>
        ) : null}
        <select aria-label={`Constraint ${n}, comparison`} className={SELECT} value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value === ">=" ? ">=" : "<=" })}>
          <option value="<=">≤ at most</option>
          <option value=">=">≥ at least</option>
        </select>
        <Input
          inputMode="decimal"
          aria-label={`Constraint ${n}, right-hand side`}
          value={value.rhs}
          onChange={(e) => onChange({ ...value, rhs: e.target.value })}
          placeholder="value"
          className="w-24 tabular-nums"
        />
        <Button type="button" size="sm" variant="ghost" onClick={onRemove} className="ml-auto">
          Remove
        </Button>
      </div>
      <FieldHint error={error} />
    </fieldset>
  );
}
