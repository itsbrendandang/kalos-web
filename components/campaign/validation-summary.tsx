"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/kit/disclosure";
import { Verdict } from "@/components/kit/verdict";
import { WhyLine } from "@/components/kit/why-line";
import type { Tone } from "@/components/kit/tone";
import { formatNumber } from "@/lib/format";
import {
  conversionSummary,
  findingPhrase,
  getCheckExplanation,
  getCheckLabel,
  affectedRowCount,
  groupFindingsByCheck,
  isRowListTruncated,
  listedRows,
  rowListCaption,
  type ValidationFinding,
  type ValidationReport,
  type ValidationStatus,
} from "@/lib/validation";
import { capFindings } from "@/components/campaign/stage-logic";
import { whyLine } from "@/lib/why";

const TONE: Record<ValidationStatus, Tone> = { pass: "good", pass_with_warnings: "warn", fail: "bad" };
const WHY_BY_STATUS: Record<ValidationStatus, string> = { pass: "sheet_passed", pass_with_warnings: "sheet_usable_with_warnings", fail: "sheet_has_errors" };

/** The verdict sentence. Warnings and notes are counted apart, so the count here is the count of findings listed below. */
export function sentence(report: ValidationReport): string {
  const { status, counts } = report;
  const checks = report.checks_run.length;
  const n = (k: number, one: string) => `${formatNumber(k, "count")} ${one}${k === 1 ? "" : "s"}`;
  const notes = counts.info > 0 ? ` and ${n(counts.info, "note")}` : "";
  if (status === "fail") return `Fix ${n(counts.error, "problem")} in this run sheet, then upload it again.`;
  if (status === "pass_with_warnings") return `This run sheet is usable, with ${n(counts.warning, "warning")}${notes} to review.`;
  if (counts.info > 0) return `This run sheet passed ${checks > 0 ? `all ${formatNumber(checks, "count")} checks` : "every check"}, with ${n(counts.info, "note")}.`;
  return checks > 0 ? `This run sheet passed all ${formatNumber(checks, "count")} checks.` : "This run sheet passed every check.";
}

/**
 * The sheet check as one verdict: at most three findings up front, each with the rows it names one click
 * down (with their values when the sheet is held in the browser: `valueAt`), its why-line, unit conversions
 * in plain words; the engine's own messages one click down.
 */
export function ValidationSummary({ report, valueAt }: { report: ValidationReport; valueAt?: (column: string, index: number) => string | null }) {
  const [all, setAll] = useState(false);
  const { shown, hidden } = capFindings(report.findings, all ? Infinity : undefined);
  const total = report.findings.length;
  const names = report.checks_run;
  const groups = new Map(groupFindingsByCheck(report.findings).map((g) => [g.check, g.findings]));

  return (
    <div className="flex flex-col gap-5">
      <Verdict tone={TONE[report.status]} why={whyLine(WHY_BY_STATUS[report.status])}>
        {sentence(report)}
      </Verdict>

      {total > 0 ? (
        <ul className="flex flex-col border-t border-border">
          {shown.map((f, i) => (
            <li key={i} className="flex flex-col gap-0.5 border-b border-border py-3">
              <span className="text-body text-fg">{findingPhrase(f)}</span>
              <span className="text-caption text-fg-muted">
                {[f.column, rowListCaption(f)].filter(Boolean).join(" - ")}
              </span>
              <AffectedRows finding={f} valueAt={valueAt} />
              {whyLine(f.check) ? (
                <Disclosure summary={<span className="text-caption text-fg-muted">Why</span>} className="border-t-0 [&>summary]:py-1">
                  <WhyLine code={f.check} className="text-caption" />
                </Disclosure>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {hidden > 0 ? (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setAll(true)}>
          Show the other {formatNumber(hidden, "count")} {hidden === 1 ? "finding" : "findings"}
        </Button>
      ) : null}

      <Disclosure summary="Unit conversions" meta={report.conversions.length ? formatNumber(report.conversions.length, "count") : "none needed"}>
        {report.conversions.length === 0 ? (
          <p className="text-body text-fg-muted">No conversions were needed. Every value was already in its expected unit.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-body text-fg-muted">
            {report.conversions.map((c, i) => (
              <li key={i}>{conversionSummary(c)}</li>
            ))}
          </ul>
        )}
      </Disclosure>

      <Disclosure summary="What was checked" meta={names.length > 0 ? `${formatNumber(names.length, "count")} checks` : undefined}>
        <dl className="flex flex-col gap-3">
          {(names.length > 0 ? names : [...groups.keys()]).map((check) => (
            <div key={check}>
              <dt className="text-label text-fg">
                {getCheckLabel(check)} <span className="text-fg-muted">({groups.get(check)?.length ?? 0} found)</span>
              </dt>
              <dd className="text-body text-fg-muted">{getCheckExplanation(check)}</dd>
              {groups.get(check)?.map((f, i) => (
                <dd key={i} className="text-caption text-fg-muted">
                  As Kalos wrote it{f.column ? ` (${f.column})` : ""}: {f.message}
                </dd>
              ))}
            </div>
          ))}
          <p className="text-caption text-fg-muted">
            <span className="tabular-nums">{formatNumber(report.n_rows, "count")}</span> rows, <span className="tabular-nums">{formatNumber(report.n_columns, "count")}</span> columns.{" "}
            {report.mode === "strict" ? "Kalos refuses a sheet with errors." : "Kalos warns about what it finds and still reads the sheet; only errors stop it."}
          </p>
        </dl>
      </Disclosure>
    </div>
  );
}

/** The rows a finding names, one click down, with their values when the sheet is held in the browser. The count in the summary is the count listed here. */
function AffectedRows({ finding, valueAt }: { finding: ValidationFinding; valueAt?: (column: string, index: number) => string | null }) {
  const rows = listedRows(finding, valueAt);
  if (rows.length === 0) return null;
  const truncated = isRowListTruncated(finding);
  return (
    <Disclosure summary={<span className="text-caption text-fg-muted">Show the {formatNumber(rows.length, "count")} {rows.length === 1 ? "row" : "rows"} named</span>} className="border-t-0 [&>summary]:py-1">
      <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-caption text-fg tabular-nums">
        {rows.map((r) => (
          <li key={r.row}>
            Row {formatNumber(r.row, "count")}
            {r.value != null ? <span className="text-fg-muted">: {r.value}</span> : null}
          </li>
        ))}
      </ul>
      {truncated ? (
        <p className="mt-1 text-caption text-fg-muted">
          Kalos names at most {formatNumber(rows.length, "count")} rows per finding; the other {formatNumber(affectedRowCount(finding) - rows.length, "count")} are counted but not named.
        </p>
      ) : null}
      {rows.some((r) => r.value == null) && finding.column ? <p className="mt-1 text-caption text-fg-muted">Values appear when the sheet is held in this browser (upload it again after a reload).</p> : null}
    </Disclosure>
  );
}
