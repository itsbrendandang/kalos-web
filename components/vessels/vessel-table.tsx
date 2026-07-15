"use client";

import { Fragment } from "react";
import { seqColor } from "@/components/dashboard/heat-scale";
import { Sparkline } from "@/components/vessels/sparkline";
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
  "sticky top-0 z-10 h-[26px] border-r border-b border-border bg-blue-tint px-2.5 align-middle text-[10px] leading-none font-semibold tracking-[0.03em] text-muted uppercase";
const SUBHEAD_TH =
  "sticky top-[26px] z-10 h-[24px] border-r border-b border-border bg-card px-2.5 align-middle text-[10px] leading-none font-semibold text-muted";

/**
 * One row per ambr vessel: metadata + inline per-channel kinetic sparklines.
 * Click a row to toggle it into/out of the selection (traces + scatter follow).
 */
export function VesselTable({ vessels, titerMin, titerMax, selectedIds, onToggle }: VesselTableProps) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-[10px] border border-border">
      <table className="w-full border-collapse whitespace-nowrap">
        <thead>
          <tr>
            <th className={HEAD_TH}></th>
            <th className={HEAD_TH} colSpan={2}>
              Cell info
            </th>
            <th className={HEAD_TH} colSpan={2}>
              Vessel properties
            </th>
            <th className={HEAD_TH}>System</th>
            <th className={HEAD_TH}>Growth media</th>
            <th className={HEAD_TH}>Reactor</th>
            {CHANNEL_GROUPS.map((g) => (
              <th key={g.key} className={HEAD_TH} colSpan={2}>
                {g.label}
              </th>
            ))}
          </tr>
          <tr>
            <th className={SUBHEAD_TH}>#</th>
            <th className={SUBHEAD_TH}>Cell line</th>
            <th className={SUBHEAD_TH}>Protein</th>
            <th className={SUBHEAD_TH}>Vessel</th>
            <th className={SUBHEAD_TH}>CSI</th>
            <th className={SUBHEAD_TH}></th>
            <th className={SUBHEAD_TH}>Medium</th>
            <th className={SUBHEAD_TH}>Vol (mL)</th>
            {CHANNEL_GROUPS.map((g) => (
              <Fragment key={g.key}>
                <th className={SUBHEAD_TH}>{g.unit}</th>
                <th className={SUBHEAD_TH}>trace</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {vessels.map((v) => {
            const selected = selectedIds.has(v.idx);
            const color = seqColor(v.finalTiter, titerMin, titerMax);
            return (
              <tr
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
                className={cn(
                  "cursor-pointer border-b border-grid",
                  selected ? "bg-blue-tint" : "hover:bg-blue-soft",
                )}
              >
                <td
                  className={cn(
                    "border-r border-l-[3px] border-grid px-2.5 py-1 font-mono text-[11px] text-muted",
                    selected ? "border-l-blue" : "border-l-transparent",
                  )}
                >
                  {v.idx}
                </td>
                <td className="border-r border-grid px-2.5 py-1 text-[11.5px] text-fg">{v.cellLine}</td>
                <td className="border-r border-grid px-2.5 py-1 text-[11.5px] text-fg">{v.protein}</td>
                <td className="border-r border-grid px-2.5 py-1 text-[11.5px] text-fg">{v.vesselId}</td>
                <td className="border-r border-grid px-2.5 py-1 text-[11.5px] text-fg">{v.csi}</td>
                <td className="border-r border-grid px-2.5 py-1 text-[11.5px] text-muted">{v.system}</td>
                <td className="border-r border-grid px-2.5 py-1 text-[11.5px] text-muted">{v.medium}</td>
                <td className="tabular border-r border-grid px-2.5 py-1 font-mono text-[11.5px] font-semibold text-fg">
                  {v.volumeMl}
                </td>
                {CHANNEL_GROUPS.map((g) => (
                  <Fragment key={g.key}>
                    <td className="tabular border-r border-grid px-2.5 py-1 font-mono text-[11.5px] font-semibold text-fg">
                      {v.endpoints[g.key].toFixed(g.key === "vcd" ? 2 : g.key === "via" ? 1 : 2)}
                    </td>
                    <td className="border-r border-grid px-2.5 py-1">
                      <Sparkline values={v.series[g.key]} color={color} />
                    </td>
                  </Fragment>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
