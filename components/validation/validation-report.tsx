import { AlertTriangle, CheckCircle2, PlugZap, Wand2, XCircle } from "lucide-react";
import type { ValidationFinding, ValidationReport, ValidationSeverity, ValidationStatus } from "@/lib/validation";
import {
  conversionSummary,
  getCheckExplanation,
  getCheckLabel,
  groupFindingsByCheck,
  isRowListTruncated,
  rowListCaption,
  validationHeadline,
} from "@/lib/validation";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/honest-state";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<ValidationStatus, typeof CheckCircle2> = {
  fail: XCircle,
  pass_with_warnings: AlertTriangle,
  pass: CheckCircle2,
};

const STATUS_LABEL: Record<ValidationStatus, string> = {
  fail: "Fail",
  pass_with_warnings: "Pass with warnings",
  pass: "Pass",
};

// Red has no dedicated "-soft" background token (see app/globals.css), so the
// fail state uses the same border/30 + bg/10 opacity recipe already used for
// error callouts elsewhere (app/error.tsx, components/planning/task-card.tsx).
const STATUS_STYLE: Record<ValidationStatus, string> = {
  fail: "border-red/30 border-l-red bg-red/10 text-red",
  pass_with_warnings: "border-amber/30 border-l-amber bg-amber-soft text-amber",
  pass: "border-green/30 border-l-green bg-green-soft text-green",
};

const SEVERITY_TEXT: Record<ValidationSeverity, string> = {
  error: "text-red",
  warning: "text-amber",
  info: "text-muted",
};

const SEVERITY_DOT: Record<ValidationSeverity, string> = {
  error: "bg-red",
  warning: "bg-amber",
  info: "bg-muted",
};

const SEVERITY_LABEL: Record<ValidationSeverity, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};

/** Colored dot + count + text label - never color alone, same convention as
 *  components/plate/status-chip.tsx and components/experiments/status-chip.tsx. */
function SeverityChip({ severity, count }: { severity: ValidationSeverity; count: number }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] font-bold", SEVERITY_TEXT[severity])}>
      <span className={cn("size-2 shrink-0 rounded-[2px]", SEVERITY_DOT[severity])} />
      <span className="tabular font-mono">{count}</span> {SEVERITY_LABEL[severity]}
    </span>
  );
}

function VerdictHeader({ report }: { report: ValidationReport }) {
  const Icon = STATUS_ICON[report.status];
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border border-l-4 p-4", STATUS_STYLE[report.status])}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold">{STATUS_LABEL[report.status]}</span>
          <Badge variant="outline" className="text-muted">
            {report.mode === "strict" ? "Strict mode" : "Warn mode"}
          </Badge>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed">{validationHeadline(report)}</p>
      </div>
    </div>
  );
}

function CountsRow({ report }: { report: ValidationReport }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <StatTile label="Rows" value={report.n_rows} />
      <StatTile label="Columns" value={report.n_columns} />
      <StatTile label="Checks run" value={report.checks_run} />
      {/* Not a StatTile: the value is three chips, not one number - truncate
          on StatTile's fixed-width value slot would clip a multi-chip row. */}
      <Card className="flex h-[76px] flex-col justify-center gap-1.5 rounded-xl bg-blue-soft px-3.5 py-2">
        <div className="text-[10.5px] font-semibold tracking-wide text-muted uppercase">Error / Warning / Info</div>
        <div className="flex flex-wrap items-baseline gap-1 text-[15px]">
          <SeverityChip severity="error" count={report.counts.error} />
          <span className="text-muted">/</span>
          <SeverityChip severity="warning" count={report.counts.warning} />
          <span className="text-muted">/</span>
          <SeverityChip severity="info" count={report.counts.info} />
        </div>
      </Card>
    </div>
  );
}

/** One finding: message, affected column, and the row indices - with the
 *  honest "showing 20 of 143 affected rows" note appended whenever the
 *  engine's list is a truncated view of a larger affected set. */
function FindingRow({ finding }: { finding: ValidationFinding }) {
  const rows = finding.rows;
  const truncated = isRowListTruncated(finding);
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-start gap-2">
        <span className={cn("mt-0.5 size-1.5 shrink-0 rounded-full", SEVERITY_DOT[finding.severity])} />
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg">{finding.message}</p>
      </div>
      {finding.column || rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-3.5 font-mono text-[11px] text-muted">
          {finding.column ? (
            <span>
              column <span className="text-fg">{finding.column}</span>
            </span>
          ) : null}
          {rows.length > 0 ? (
            <span>
              rows {rows.join(", ")}
              {truncated ? ` - ${rowListCaption(finding)}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FindingsByCheck({ findings }: { findings: ValidationFinding[] }) {
  if (findings.length === 0) {
    return (
      <EmptyState icon={CheckCircle2} title="No findings" description="Every check came back clean." />
    );
  }

  const groups = groupFindingsByCheck(findings);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <Card key={group.check} className="p-4">
          <div className="mb-1 flex flex-wrap items-baseline gap-2">
            <span className="text-[13px] font-semibold text-fg">{getCheckLabel(group.check)}</span>
            <span className="text-[11px] text-muted">
              {group.findings.length} finding{group.findings.length === 1 ? "" : "s"}
            </span>
          </div>
          {getCheckExplanation(group.check) ? (
            <p className="mb-2 text-[12px] leading-snug text-muted">{getCheckExplanation(group.check)}</p>
          ) : null}
          <div>
            {group.findings.map((f, i) => (
              <FindingRow key={i} finding={f} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/** The trust-earning section: exactly what the engine silently changed about
 *  the client's data. Always rendered (even when empty) so "nothing was
 *  converted" is an explicit, honest statement rather than an absent section. */
function ConversionsSection({ conversions }: { conversions: ValidationReport["conversions"] }) {
  return (
    <Card>
      <SectionLabel>Unit conversions applied</SectionLabel>
      {conversions.length === 0 ? (
        <p className="text-[12.5px] text-muted">No unit conversions were needed - every value was already in its expected unit.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {conversions.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5 text-[12.5px] text-fg">
              <Wand2 className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <span className="font-mono">{conversionSummary(c)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function NoValidationReport() {
  return (
    <EmptyState
      icon={PlugZap}
      title="No validation report"
      description="This engine response did not include a data-validation report - most likely an older engine build that predates pre-flight checks. Nothing here should be read as a pass."
    />
  );
}

/**
 * The main validation surface: a verdict header (fail / pass_with_warnings /
 * pass), a counts row, findings grouped by check (errors first), and the
 * unit-conversions section that shows exactly what the engine silently
 * changed. Renders an honest empty state - not a fake pass - when the
 * engine response has no `validation` block at all.
 */
export function ValidationReportCard({ report }: { report: ValidationReport | null | undefined }) {
  if (!report) return <NoValidationReport />;

  return (
    <div className="flex flex-col gap-4">
      <VerdictHeader report={report} />
      <CountsRow report={report} />
      <div>
        <SectionLabel>Findings</SectionLabel>
        <FindingsByCheck findings={report.findings} />
      </div>
      <ConversionsSection conversions={report.conversions} />
    </div>
  );
}
