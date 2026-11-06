"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SheetProfileState } from "@/components/campaign/data/use-sheet-profile";
import { buildLabel, defaultInputs, describeColumns, guessTarget, rolesFor, type ColumnChoice } from "@/lib/column-choice";
import type { ColumnRolesInput } from "@/lib/api";
import { directionWarning } from "@/lib/objective";
import { formatNumber } from "@/lib/format";
import { TriangleAlert } from "lucide-react";

/** What the model was last built with for this file, so the panel can say whether the choice on screen is the one in use. */
export type BuiltColumns = { target: string; features: readonly string[] };

/**
 * The one decision on Setup, above the fold and before anything is sent to Kalos: which column to
 * raise, which columns Kalos may change, and what every other column is. Read from the dropped file in
 * the browser. The fit starts only when the user presses the button; the choice goes to Kalos as explicit
 * roles, so the columns ticked here are the columns the model uses.
 */
export function ColumnChoicePanel({
  name,
  state,
  busy,
  built,
  onBuild,
}: {
  name: string;
  state: SheetProfileState | null;
  busy: boolean;
  built: BuiltColumns | null;
  onBuild: (roles: ColumnRolesInput, target: string) => void;
}) {
  const profile = state?.status === "ready" ? state.profile : null;
  const [picked, setPicked] = useState<{ target: string | null; inputs: Set<string> } | null>(null);
  const guessed = useMemo(() => (profile ? guessTarget(profile) : null), [profile]);
  const target = picked ? picked.target : guessed;
  const choices: ColumnChoice[] = useMemo(() => (profile ? describeColumns(profile, target) : []), [profile, target]);
  const inputs = picked?.inputs ?? defaultInputs(choices);
  const targets = choices.filter((c) => c.canBeTarget);
  const candidates = choices.filter((c) => c.name !== target);
  const ticked = candidates.filter((c) => inputs.has(c.name));
  const same = built != null && target === built.target && ticked.length === built.features.length && ticked.every((c) => built.features.includes(c.name));
  const warning = directionWarning(target);

  if (!state || state.status === "loading") {
    return (
      <Section>
        <p className="text-body text-fg-muted">Reading {name} in your browser…</p>
      </Section>
    );
  }
  if (!profile || profile.n === 0) {
    return (
      <Section>
        <p className="text-body text-fg-muted">
          {state.status === "unreadable"
            ? state.reason === "too-large"
              ? "This file is over 5 MB, so its columns could not be read in the browser. Kalos reads it and chooses the columns itself."
              : "This file could not be read in the browser, so its columns are not listed here. Kalos reads it and chooses the columns itself."
            : "This sheet has a header and no run rows."}
        </p>
      </Section>
    );
  }

  const setTarget = (t: string) =>
    setPicked({
      target: t,
      inputs: new Set([...inputs].filter((c) => c !== t)),
    });
  const toggle = (c: string) => {
    const next = new Set(inputs);
    if (!next.delete(c)) next.add(c);
    setPicked({ target, inputs: next });
  };
  const roles = target ? rolesFor(choices, target, inputs) : null;

  return (
    <Section>
      <p className="text-body text-fg">
        <span className="font-mono text-code">{name}</span>: <span className="tabular-nums">{formatNumber(profile.n, "count")}</span> runs,{" "}
        <span className="tabular-nums">{formatNumber(profile.columns.length, "count")}</span> columns. Choose the column to raise and tick the inputs Kalos may change in its recipes. Leave out labels, dates and anything measured
        after the run.
      </p>
      <label className="flex flex-col gap-1.5 text-label text-fg sm:max-w-sm">
        Target to raise
        <select className="rounded-lg border border-border-input bg-surface px-2 py-1.5 text-body text-fg" value={target ?? ""} onChange={(e) => setTarget(e.target.value)} disabled={busy || targets.length === 0}>
          {targets.length === 0 ? <option value="">No number column varies in this sheet</option> : null}
          {targets.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {warning ? (
        <p className="flex items-start gap-2 text-body text-fg sm:max-w-xl">
          <TriangleAlert className="mt-1 size-4 shrink-0 text-warn" aria-hidden />
          <span>{warning}</span>
        </p>
      ) : null}
      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="text-label text-fg">
          Inputs Kalos may change (<span className="tabular-nums">{formatNumber(ticked.length, "count")}</span> of <span className="tabular-nums">{formatNumber(candidates.length, "count")}</span> columns)
        </legend>
        <ul className="flex flex-col divide-y divide-border">
          {candidates.map((c) => (
            <li key={c.name} className="py-2">
              <label className="flex items-start gap-2 text-body text-fg">
                <input type="checkbox" className="mt-1.5" aria-label={`${c.name}: ${c.what}`} checked={inputs.has(c.name)} disabled={!c.canBeInput} onChange={() => toggle(c.name)} />
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono text-code break-words">{c.name}</span>
                  <span className="text-caption text-fg-muted">
                    {c.what}
                    {!inputs.has(c.name) && c.reason ? ` · left out: ${c.reason}` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || !roles || roles.features.length === 0 || same} onClick={() => roles && target && onBuild(roles, target)}>
          {same ? "The model uses these columns" : buildLabel(ticked.length, built != null)}
        </Button>
        <span className="text-caption text-fg-muted">
          {same
            ? "Change the target or the inputs to build it again."
            : built
              ? "The model on this page was built with other columns; building again replaces it."
              : roles && roles.features.length === 0
                ? "Tick at least one input."
                : "Nothing is sent to Kalos until you press this. It then checks the sheet, builds the model and tests it on runs it has not seen."}
        </span>
      </div>
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="column-choice-title" className="flex flex-col gap-4">
      <h2 id="column-choice-title" className="text-heading text-fg">
        What to raise, and what Kalos may change
      </h2>
      {children}
    </section>
  );
}
