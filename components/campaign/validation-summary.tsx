"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/kit/disclosure";
import { Verdict } from "@/components/kit/verdict";
import type { Tone } from "@/components/kit/tone";
import { formatNumber } from "@/lib/format";
import {
  conversionSummary,
  getCheckExplanation,
  getCheckLabel,
  groupFindingsByCheck,
  rowListCaption,
  type ValidationReport,
  type ValidationStatus,
} from "@/lib/validation";
import { capFindings } from "@/components/campaign/stage-logic";

const TONE: Record<ValidationStatus, Tone> = { pass: "good", pass_with_warnings: "warn", fail: "bad" };

function sentence({ status, counts, checks_run }: ValidationReport): string {
  const n = (k: number, one: string) => `${formatNumber(k, "count")} ${one}${k === 1 ? "" : "s"}`;
  if (status === "fail") return `Fix ${n(counts.error, "problem")} in this run sheet before you rely on it.`;
  if (status === "pass_with_warnings") return `This run sheet is usable, with ${n(counts.warning, "warning")} to review.`;
  return `This run sheet passed all ${formatNumber(checks_run, "count")} checks.`;
}

/** The data check as one verdict: at most three findings up front, unit conversions in plain words, raw checks one click down. */
export function ValidationSummary({ report }: { report: ValidationReport }) {
  const [all, setAll] = useState(false);
  const { shown, hidden } = capFindings(report.findings, all ? Infinity : undefined);
  const total = report.findings.length;

  return (
    <div className="flex flex-col gap-5">
      <Verdict tone={TONE[report.status]}>{sentence(report)}</Verdict>

      {total > 0 ? (
        <ul className="flex flex-col border-t border-border">
          {shown.map((f, i) => (
            <li key={i} className="flex flex-col gap-0.5 border-b border-border py-3">
              <span className="text-body text-fg">{f.message}</span>
              <span className="text-caption text-fg-muted">
                {[f.column, rowListCaption(f)].filter(Boolean).join(" - ")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {hidden > 0 ? (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setAll(true)}>
          Show all {formatNumber(total, "count")} findings
        </Button>
      ) : null}

      <div className="flex flex-col gap-1">
        <h2 className="text-heading text-fg">Unit conversions</h2>
        {report.conversions.length === 0 ? (
          <p className="text-body text-fg-muted">No conversions were needed. Every value was already in its expected unit.</p>
        ) : (
          <ul className="text-body text-fg-muted">
            {report.conversions.map((c, i) => (
              <li key={i}>{conversionSummary(c)}</li>
            ))}
          </ul>
        )}
      </div>

      <Disclosure summary="Method details" meta={`${formatNumber(report.checks_run, "count")} checks`}>
        <dl className="flex flex-col gap-3">
          {groupFindingsByCheck(report.findings).map((g) => (
            <div key={g.check}>
              <dt className="text-label text-fg">
                {getCheckLabel(g.check)} <span className="text-fg-muted">({formatNumber(g.findings.length, "count")})</span>
              </dt>
              <dd className="text-body text-fg-muted">{getCheckExplanation(g.check)}</dd>
            </div>
          ))}
          <p className="text-caption text-fg-muted">
            {formatNumber(report.n_rows, "count")} rows, {formatNumber(report.n_columns, "count")} columns, checked in {report.mode === "strict" ? "strict" : "warn"} mode.
          </p>
        </dl>
      </Disclosure>
    </div>
  );
}
