"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import { seqColor } from "@/components/dashboard/heat-scale";
import { Sparkline } from "@/components/vessels/sparkline";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
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

// Both header rows are 40px (TableHead's own h-10). The second row's sticky
// offset is the first row's measured height (a CSS variable set in a layout
// effect), so nothing is hard-coded and the rows cannot drift apart.
const HEAD_TH = "border-r border-b border-border bg-accent-soft px-2.5 text-caption font-medium";
const SUBHEAD_TH = "top-[var(--vessel-head-h,2.5rem)] border-r border-b border-border bg-surface px-2.5 text-caption font-medium";
const CELL = "border-r border-border px-2.5 py-1 text-caption";

/**
 * One row per ambr vessel: metadata + inline per-channel kinetic sparklines.
 * Click a row to toggle it into/out of the selection (traces + scatter follow).
 */
export function VesselTable({ vessels, titerMin, titerMax, selectedIds, onToggle }: VesselTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstHeadRow = useRef<HTMLTableRowElement>(null);

  useLayoutEffect(() => {
    const row = firstHeadRow.current;
    const box = scrollRef.current;
    if (!row || !box) return;
    const sync = () => box.style.setProperty("--vessel-head-h", `${row.getBoundingClientRect().height}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label="Vessels table, scrollable"
      tabIndex={0}
      className="max-h-[420px] overflow-auto rounded-lg border border-border"
    >
      <Table containerClassName="overflow-visible" className="w-full border-collapse whitespace-nowrap">
        <TableHeader>
          <TableRow ref={firstHeadRow} className="border-none hover:bg-transparent">
            <TableHead className={HEAD_TH}>
              <span className="sr-only">Selection</span>
            </TableHead>
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
                data-state={selected ? "selected" : undefined}
                className="cursor-pointer"
              >
                {/* The checkbox is the keyboard and screen-reader control (checked
                    state is valid on it); row clicks are a pointer convenience. */}
                <TableCell className={cn(CELL, "tabular-nums text-fg-muted")}>
                  <label className="flex cursor-pointer items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected}
                      onChange={() => onToggle(v.idx)}
                      aria-label={`Select vessel ${v.vesselId}`}
                    />
                    {v.idx}
                  </label>
                </TableCell>
                <TableCell className={cn(CELL, "text-fg")}>{v.cellLine}</TableCell>
                <TableCell className={cn(CELL, "text-fg")}>{v.protein}</TableCell>
                <TableCell className={cn(CELL, "text-fg")}>{v.vesselId}</TableCell>
                <TableCell className={cn(CELL, "text-fg")}>{v.csi}</TableCell>
                <TableCell className={cn(CELL, "text-fg-muted")}>{v.system}</TableCell>
                <TableCell className={cn(CELL, "text-fg-muted")}>{v.medium}</TableCell>
                <TableCell numeric className={cn(CELL, "text-fg")}>
                  {v.volumeMl}
                </TableCell>
                {CHANNEL_GROUPS.map((g) => (
                  <Fragment key={g.key}>
                    <TableCell numeric className={cn(CELL, "text-fg")}>
                      {v.endpoints[g.key].toFixed(g.key === "vcd" ? 2 : g.key === "via" ? 1 : 2)}
                    </TableCell>
                    <TableCell className="border-r border-border px-2.5 py-1">
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
