import Link from "next/link";
import { Play, RotateCcw, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExperimentStatusChip } from "@/components/experiments/status-chip";
import type { ExperimentStatus, ExperimentSummary } from "@/lib/experiments";

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "just now";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Row actions available for each experiment status, per the store's legal
 *  transitions (kalos/docs/M2_INTEGRATION.md): DRAFT/FAILED -> flag READY,
 *  READY -> run, DONE -> re-run with force, PROCESSING -> none. */
export function ExperimentTable({
  experiments,
  busyIds,
  onFlagReady,
  onRun,
}: {
  experiments: ExperimentSummary[];
  busyIds: Set<string>;
  onFlagReady: (id: string) => void;
  onRun: (id: string, force: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-y-1.5 text-[13px]">
        <thead>
          <tr className="text-[10px] text-muted uppercase">
            <th className="px-3 py-1.5">Name</th>
            <th className="px-3 py-1.5">Status</th>
            <th className="px-3 py-1.5">Updated</th>
            <th className="px-3 py-1.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {experiments.map((exp) => (
            <ExperimentRow
              key={exp.id}
              exp={exp}
              busy={busyIds.has(exp.id)}
              onFlagReady={() => onFlagReady(exp.id)}
              onRun={(force) => onRun(exp.id, force)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExperimentRow({
  exp,
  busy,
  onFlagReady,
  onRun,
}: {
  exp: ExperimentSummary;
  busy: boolean;
  onFlagReady: () => void;
  onRun: (force: boolean) => void;
}) {
  return (
    <tr className="group">
      <td className="rounded-l-xl border-y border-l border-border/70 bg-card px-3 py-2.5 group-hover:bg-blue-soft">
        <Link href={`/experiments/${exp.id}`} className="font-semibold text-fg hover:text-accent-hover hover:underline">
          {exp.name}
        </Link>
      </td>
      <td className="border-y border-border/70 bg-card px-3 py-2.5 group-hover:bg-blue-soft">
        <ExperimentStatusChip status={exp.status} />
      </td>
      <td className="border-y border-border/70 bg-card px-3 py-2.5 font-mono text-[12px] text-muted group-hover:bg-blue-soft">
        {ago(exp.updated_at)}
      </td>
      <td className="rounded-r-xl border-y border-r border-border/70 bg-card px-3 py-2.5 group-hover:bg-blue-soft">
        <RowActions status={exp.status} busy={busy} onFlagReady={onFlagReady} onRun={onRun} />
      </td>
    </tr>
  );
}

function RowActions({
  status,
  busy,
  onFlagReady,
  onRun,
}: {
  status: ExperimentStatus;
  busy: boolean;
  onFlagReady: () => void;
  onRun: (force: boolean) => void;
}) {
  if (status === "DRAFT" || status === "FAILED") {
    return (
      <Button variant="outline" size="sm" disabled={busy} onClick={onFlagReady}>
        <Flag />
        {status === "FAILED" ? "Retry" : "Flag ready"}
      </Button>
    );
  }
  if (status === "READY") {
    return (
      <Button variant="outline" size="sm" disabled={busy} onClick={() => onRun(false)}>
        <Play />
        Run
      </Button>
    );
  }
  if (status === "DONE") {
    return (
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRun(true)}>
        <RotateCcw />
        Re-run
      </Button>
    );
  }
  return <span className="text-[12px] text-muted">Processing...</span>;
}
