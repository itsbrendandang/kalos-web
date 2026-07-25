"use client";

import { useState } from "react";
import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { VesselTable } from "@/components/vessels/vessel-table";
import { KineticOverlay } from "@/components/vessels/kinetic-overlay";
import { CorrelationScatter } from "@/components/vessels/correlation-scatter";
import { PageHeader, DemoBadge } from "@/components/page-header";
import { VESSELS } from "@/lib/vessel-data";
import { DEMO_MODE } from "@/lib/demo";

/** Honest empty state: there is no live vessel/kinetics source yet, so with demo
 *  mode off the page renders nothing fabricated rather than 48 simulated vessels
 *  that could read as a real run. */
function NoLiveVessels() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Vessel Workspace" desc="Per-vessel ambr kinetics and titer-vs-qP correlation." />
      <Card className="flex flex-col items-center gap-1.5 py-10 text-center">
        <PlugZap className="size-5 text-muted" />
        <div className="text-[13.5px] font-semibold text-fg">No live vessel data</div>
        <p className="max-w-[46ch] text-[12px] leading-5 text-muted">
          No live vessel/kinetics source is connected yet. Set{" "}
          <code className="font-mono">NEXT_PUBLIC_DEMO_MODE=true</code> to preview this workspace with demo data.
        </p>
      </Card>
    </div>
  );
}

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

  if (!DEMO_MODE) return <NoLiveVessels />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Vessel Workspace - ambr CHO Fed-Batch · 48 vessels"
        desc="kalos vessel analysis · simulated 48-vessel ambr CHO run - titer, viability, VCD, lactate, glucose, pH."
        action={<DemoBadge />}
      />

      <p className="text-[12px] text-muted">
        Click rows to change the selection - kinetic overlays and the correlation scatter follow along.{" "}
        <span className="font-semibold text-fg">{selectedIds.size}</span> of {VESSELS.vessels.length} vessels
        selected.
      </p>

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
