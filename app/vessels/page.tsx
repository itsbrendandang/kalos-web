"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { VesselTable } from "@/components/vessels/vessel-table";
import { KineticOverlay } from "@/components/vessels/kinetic-overlay";
import { CorrelationScatter } from "@/components/vessels/correlation-scatter";
import { VESSELS } from "@/lib/vessel-data";

/**
 * Vessel workspace: 48-vessel ambr CHO run - a metadata + sparkline table, kinetic
 * overlays per channel, and a titer-vs-qP correlation scatter. Renders from the
 * deterministic seed data in lib/vessel-data.ts - see that file for the real-API
 * integration point.
 */
export default function VesselsPage() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(VESSELS.defaultSelectedIds));

  function toggle(idx: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-border bg-blue-tint px-3.5 py-1.5 text-[12px] font-semibold text-blue-deep">
        kalos vessel analysis · simulated 48-vessel ambr CHO run - titer, viability, VCD, lactate, glucose, pH.
      </div>

      <div>
        <h1 className="font-head text-[19px] font-bold tracking-tight text-fg">
          Vessel Workspace — ambr CHO Fed-Batch · 48 vessels
        </h1>
        <p className="mt-1.5 text-[12px] text-muted">
          Click rows to change the selection - kinetic overlays and the correlation scatter follow along.{" "}
          <span className="font-semibold text-fg">{selectedIds.size}</span> of {VESSELS.vessels.length} vessels
          selected.
        </p>
      </div>

      <Card className="p-3.5">
        <VesselTable
          vessels={VESSELS.vessels}
          titerMin={VESSELS.titerMin}
          titerMax={VESSELS.titerMax}
          selectedIds={selectedIds}
          onToggle={toggle}
        />
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-5">
        <Card className="p-3.5">
          <CorrelationScatter
            vessels={VESSELS.vessels}
            titerMin={VESSELS.titerMin}
            titerMax={VESSELS.titerMax}
            selectedIds={selectedIds}
          />
        </Card>
        <Card className="p-3.5">
          <KineticOverlay
            title="Kinetic — Titer"
            sub="TITER [g/L] vs time"
            channel="titer"
            vessels={VESSELS.vessels}
            titerMin={VESSELS.titerMin}
            titerMax={VESSELS.titerMax}
            selectedIds={selectedIds}
            yTickFormatter={(v) => v.toFixed(1)}
          />
        </Card>
        <Card className="p-3.5">
          <KineticOverlay
            title="Kinetic — Viability"
            sub="CELL_VIABILITY [%] vs time"
            channel="via"
            vessels={VESSELS.vessels}
            titerMin={VESSELS.titerMin}
            titerMax={VESSELS.titerMax}
            selectedIds={selectedIds}
            yTickFormatter={(v) => v.toFixed(0)}
          />
        </Card>
        <Card className="p-3.5">
          <KineticOverlay
            title="Kinetic — VCD"
            sub="VIABLE_CELL_DENSITY [×10⁶/mL] vs time"
            channel="vcd"
            vessels={VESSELS.vessels}
            titerMin={VESSELS.titerMin}
            titerMax={VESSELS.titerMax}
            selectedIds={selectedIds}
            yTickFormatter={(v) => v.toFixed(0)}
          />
        </Card>
        <Card className="p-3.5">
          <KineticOverlay
            title="Kinetic — pH"
            sub="pH vs time"
            channel="ph"
            vessels={VESSELS.vessels}
            titerMin={VESSELS.titerMin}
            titerMax={VESSELS.titerMax}
            selectedIds={selectedIds}
            yTickFormatter={(v) => v.toFixed(1)}
          />
        </Card>
      </div>
    </div>
  );
}
