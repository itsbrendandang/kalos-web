"use client";

import { Fragment } from "react";
import { seqColor } from "@/components/dashboard/heat-scale";
import { Sparkline } from "@/components/vessels/sparkline";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Vessel } from "@/lib/vessel-data";

interface VesselTableProps {
  vessels: Vessel[];
  titerMin: number;
  titerMax: number;
  selectedIds: Set<number>;
  onToggle: (idx: number) => void;
}

const CHANNEL_GROUPS: { label: string; key: "titer" | "via" | "vcd" | "lac" | "glu"; unit: string }[] = [
  { label: "Final titer", key: "titer", unit: "g/L" },
  { label: "Final viability", key: "via", unit: "%" },
  { label: "Final VCD", key: "vcd", unit: "×10⁶" },
  { label: "Final lactate", key: "lac", unit: "g/L" },
  { label: "Final glucose", key: "glu", unit: "g/L" },
];

// Fixed row heights (26px / 24px) so the second sticky header row's `top` offset
// lines up exactly under the first, with no gap or overlap while scrolling.
const HEAD_TH =
  "sticky top-0 z-10 h-[26px] border-r border-b border-border bg-blue-tint px-2.5 text-left align-middle text-[10px] leading-none font-semibold tracking-[0.03em] text-muted uppercase";
const SUBHEAD_TH =
  "sticky top-[26px] z-10 h-[24px] border-r border-b border-border bg-card px-2.5 text-left align-middle text-[10px] leading-none font-semibold text-muted";

/**
 * One row per ambr vessel: metadata + inline per-channel kinetic sparklines.
 * Click a row to toggle it into/out of the selection (traces + scatter follow).
 */
export function VesselTable({ vessels, titerMin, titerMax, selectedIds, onToggle }: VesselTableProps) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-[10px] border border-border">
      <Table className="w-full border-collapse whitespace-nowrap">
        <TableHeader>
          <TableRow className="border-none hover:bg-transparent">
            <TableHead className={HEAD_TH}></TableHead>
            <TableHead className={HEAD_TH} colSpan={2}>
              Cell info
            </TableHead>
            <TableHead className={HEAD_TH} colSpan={2}>
              Vessel properties
            </TableHead>
            <TableHead className={HEAD_TH}>System</TableHead>
            <TableHead className={HEAD_TH}>Growth media</TableHead>
            <TableHead className={HEAD_TH}>Reactor</TableHead>
            {CHANNEL_GROUPS.map((g) => (
              <TableHead key={g.key} className={HEAD_TH} colSpan={2}>
                {g.label}
              </TableHead>
            ))}
          </TableRow>
          <TableRow className="border-none hover:bg-transparent">
            <TableHead className={SUBHEAD_TH}>#</TableHead>
            <TableHead className={SUBHEAD_TH}>Cell line</TableHead>
            <TableHead className={SUBHEAD_TH}>Protein</TableHead>
            <TableHead className={SUBHEAD_TH}>Vessel</TableHead>
            <TableHead className={SUBHEAD_TH}>CSI</TableHead>
            <TableHead className={SUBHEAD_TH}></TableHead>
            <TableHead className={SUBHEAD_TH}>Medium</TableHead>
            <TableHead className={SUBHEAD_TH}>Vol (mL)</TableHead>
            {CHANNEL_GROUPS.map((g) => (
              <Fragment key={g.key}>
                <TableHead className={SUBHEAD_TH}>{g.unit}</TableHead>
                <TableHead className={SUBHEAD_TH}>trace</TableHead>
              </Fragment>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {vessels.map((v) => {
            const selected = selectedIds.has(v.idx);
            const color = seqColor(v.finalTiter, titerMin, titerMax);
            return (
              <TableRow
                key={v.idx}
                onClick={() => onToggle(v.idx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle(v.idx);
                  }
                }}
                // Native <tr> role kept (no role="button") so screen readers still get table-row
                // navigation; aria-selected (valid on a row) conveys the toggle state instead of
                // aria-pressed, which would otherwise override the implicit row role.
                tabIndex={0}
                aria-selected={selected}
                className={cn("cursor-pointer border-b border-grid", selected && "bg-blue-tint hover:bg-blue-tint")}
              >
                <TableCell
                  className="border-r border-grid px-2.5 py-1 font-mono text-[11px] text-muted"
                >
                  {v.idx}
                </TableCell>
                <TableCell className="border-r border-grid px-2.5 py-1 text-[11.5px] text-fg">{v.cellLine}</TableCell>
                <TableCell className="border-r border-grid px-2.5 py-1 text-[11.5px] text-fg">{v.protein}</TableCell>
                <TableCell className="border-r border-grid px-2.5 py-1 text-[11.5px] text-fg">{v.vesselId}</TableCell>
                <TableCell className="border-r border-grid px-2.5 py-1 text-[11.5px] text-fg">{v.csi}</TableCell>
                <TableCell className="border-r border-grid px-2.5 py-1 text-[11.5px] text-muted">{v.system}</TableCell>
                <TableCell className="border-r border-grid px-2.5 py-1 text-[11.5px] text-muted">{v.medium}</TableCell>
                <TableCell className="tabular border-r border-grid px-2.5 py-1 font-mono text-[11.5px] font-semibold text-fg">
                  {v.volumeMl}
                </TableCell>
                {CHANNEL_GROUPS.map((g) => (
                  <Fragment key={g.key}>
                    <TableCell className="tabular border-r border-grid px-2.5 py-1 font-mono text-[11.5px] font-semibold text-fg">
                      {v.endpoints[g.key].toFixed(g.key === "vcd" ? 2 : g.key === "via" ? 1 : 2)}
                    </TableCell>
                    <TableCell className="border-r border-grid px-2.5 py-1">
                      <Sparkline values={v.series[g.key]} color={color} />
                    </TableCell>
                  </Fragment>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
