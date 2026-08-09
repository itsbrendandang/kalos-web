import Link from "next/link";
import { Flag, MoreHorizontal, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <Table>
      <TableCaption className="sr-only">
        Experiments, with status, last updated time, and available actions
      </TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col" className="text-[10px] text-muted uppercase">
            Name
          </TableHead>
          <TableHead scope="col" className="text-[10px] text-muted uppercase">
            Status
          </TableHead>
          <TableHead scope="col" className="text-[10px] text-muted uppercase">
            Updated
          </TableHead>
          <TableHead scope="col" className="text-right text-[10px] text-muted uppercase">
            Actions
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {experiments.map((exp) => (
          <ExperimentRow
            key={exp.id}
            exp={exp}
            busy={busyIds.has(exp.id)}
            onFlagReady={() => onFlagReady(exp.id)}
            onRun={(force) => onRun(exp.id, force)}
          />
        ))}
      </TableBody>
    </Table>
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
    <TableRow>
      <TableCell>
        <Link href={`/experiments/${exp.id}`} className="font-semibold text-fg hover:text-accent-text hover:underline">
          {exp.name}
        </Link>
      </TableCell>
      <TableCell>
        <ExperimentStatusChip status={exp.status} />
      </TableCell>
      <TableCell className="tabular font-mono text-[12px] text-muted">{ago(exp.updated_at)}</TableCell>
      <TableCell className="text-right">
        <RowActions status={exp.status} busy={busy} onFlagReady={onFlagReady} onRun={onRun} name={exp.name} />
      </TableCell>
    </TableRow>
  );
}

function RowActions({
  status,
  busy,
  onFlagReady,
  onRun,
  name,
}: {
  status: ExperimentStatus;
  busy: boolean;
  onFlagReady: () => void;
  onRun: (force: boolean) => void;
  name: string;
}) {
  if (status === "PROCESSING") {
    return <span className="text-[12px] text-muted">Processing...</span>;
  }

  const action =
    status === "DRAFT" || status === "FAILED"
      ? { label: status === "FAILED" ? "Retry" : "Flag ready", icon: Flag, onSelect: onFlagReady }
      : status === "READY"
        ? { label: "Run", icon: Play, onSelect: () => onRun(false) }
        : { label: "Re-run", icon: RotateCcw, onSelect: () => onRun(true) };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Actions for ${name}`}>
            <MoreHorizontal />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={action.onSelect} disabled={busy}>
          <action.icon />
          {action.label}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
