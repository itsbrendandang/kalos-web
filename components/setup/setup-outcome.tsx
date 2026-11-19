"use client";

import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { RefusalBlock } from "@/components/viz/refusal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppliedSetup } from "@/lib/api";
import { formatSetting, formatValue } from "@/lib/num";
import { describeAppliedSetup, plainNumber, type SetupErrorCopy } from "@/components/setup/setup-logic";

/** The engine's refusal of a setup save, in plain words with what would fix it; raw values one click down. */
export function SetupError({ copy, title = "The setup was not saved" }: { copy: SetupErrorCopy; title?: string }) {
  return (
    <Callout tone="bad" title={title}>
      <p>{copy.message}</p>
      {copy.fix ? <p className="mt-1">What would fix it: {copy.fix}</p> : null}
      {copy.code || copy.detail ? (
        <Disclosure summary="Engine response" className="mt-2">
          <dl className="flex flex-col gap-1 text-caption text-fg-muted">
            {copy.code ? (
              <div>
                <dt className="inline">Code: </dt>
                <dd className="inline font-mono text-code text-fg">{copy.code}</dd>
              </div>
            ) : null}
            {copy.detail ? (
              <div>
                <dt className="inline">Message: </dt>
                <dd className="inline">{copy.detail}</dd>
              </div>
            ) : null}
          </dl>
        </Disclosure>
      ) : null}
    </Callout>
  );
}

const pair = (p: [number | null, number | null] | [number, number] | null, range: [number, number] | null) =>
  p ? `${p[0] == null ? "n/a" : formatSetting(p[0], range).text} to ${p[1] == null ? "n/a" : formatSetting(p[1], range).text}` : "n/a";

/**
 * How the campaign setup was applied to the shown analysis (`analysis.setup`): applied or refused (then the
 * batch is empty and the engine's reason and fix are shown), the bounds as requested, observed and applied
 * (flagged when a bound reached past the data), the constraints, the engine's warnings, and how many proposals
 * were dropped for breaking them. Renders nothing for analyses that predate the field.
 */
export function AppliedSetupView({ setup }: { setup: AppliedSetup | null | undefined }) {
  if (setup === undefined) return null;
  if (setup === null) {
    return <p className="text-body text-fg-muted">No campaign setup was stored when this analysis ran, so it maximized the target over the observed data range.</p>;
  }
  const v = describeAppliedSetup(setup);
  const count = (n: number) => formatValue(n, { quantity: "count" }).text;
  return (
    <div className="flex flex-col gap-4">
      {v.status === "refused" && v.refusal ? (
        <RefusalBlock
          title={`Setup refused: ${v.refusal.title}. This analysis has no proposals.`}
          reasons={v.refusal.reason ? [v.refusal.reason] : []}
          fix={v.refusal.fix ? [v.refusal.fix] : undefined}
          footer="Change the setup below, then apply it with a re-analysis or a new upload."
        />
      ) : (
        <p className="text-body text-fg">
          {v.status === "applied" ? "Applied to this analysis" : "Reported by the engine"}: the goal was to {v.goal} the target
          {v.bounds.length ? `, with ${count(v.bounds.length)} ${v.bounds.length === 1 ? "bound" : "bounds"}` : ", with no bounds"}
          {v.constraints.length ? ` and ${count(v.constraints.length)} linear ${v.constraints.length === 1 ? "constraint" : "constraints"}` : ""}.
          {v.dropped != null
            ? v.dropped > 0
              ? ` ${count(v.dropped)} ${v.dropped === 1 ? "proposal was" : "proposals were"} dropped for breaking them.`
              : " No proposal had to be dropped."
            : ""}
        </p>
      )}

      {v.bounds.length > 0 ? (
        <Table containerClassName="rounded-xl border border-border">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-surface">Input</TableHead>
              <TableHead numeric className="bg-surface">
                Your bound
              </TableHead>
              <TableHead numeric className="bg-surface">
                Observed
              </TableHead>
              <TableHead numeric className="bg-surface">
                Searched
              </TableHead>
              <TableHead className="bg-surface">Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {v.bounds.map((b) => (
              <TableRow key={b.feature}>
                <TableCell className="font-mono text-code text-fg">{b.feature}</TableCell>
                <TableCell numeric>{pair(b.requested, b.observed)}</TableCell>
                <TableCell numeric>{pair(b.observed, b.observed)}</TableCell>
                <TableCell numeric>{pair(b.applied, b.observed)}</TableCell>
                <TableCell className="whitespace-normal text-caption text-fg-muted">{b.extrapolates ? "Reaches past the data: applied only within the observed range" : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {v.constraints.length > 0 ? (
        <div>
          <h3 className="text-label text-fg">Constraints applied</h3>
          <ul className="mt-1 flex flex-col gap-1 text-body text-fg">
            {v.constraints.map((c) => (
              <li key={c} className="font-mono text-code">
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {v.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1 text-caption text-fg-muted">
          {v.warnings.map((w, i) => (
            <li key={`${w.code}-${i}`}>{w.text}</li>
          ))}
        </ul>
      ) : null}

      <Disclosure summary="Engine details for the applied setup">
        <dl className="flex flex-col gap-1 text-caption text-fg-muted">
          <div>
            <dt className="inline">Status: </dt>
            <dd className="inline font-mono text-code text-fg">{String(setup.status)}</dd>
          </div>
          {v.refusal ? (
            <div>
              <dt className="inline">Refusal code: </dt>
              <dd className="inline font-mono text-code text-fg">{v.refusal.code}</dd>
            </div>
          ) : null}
          {v.warnings.map((w, i) => (
            <div key={`raw-${i}`}>
              <dt className="inline font-mono text-code text-fg">{w.code}: </dt>
              <dd className="inline">{w.raw}</dd>
            </div>
          ))}
          {v.dropped != null ? (
            <div>
              <dt className="inline">Proposals dropped: </dt>
              <dd className="inline tabular-nums">{plainNumber(v.dropped)}</dd>
            </div>
          ) : null}
          {v.signConvention ? (
            <div>
              <dt className="inline">Sign convention: </dt>
              <dd className="inline">{v.signConvention}</dd>
            </div>
          ) : null}
          {setup.hash ? (
            <div>
              <dt className="inline">Setup hash: </dt>
              <dd className="inline font-mono text-code break-all">{setup.hash}</dd>
            </div>
          ) : null}
        </dl>
      </Disclosure>
    </div>
  );
}
