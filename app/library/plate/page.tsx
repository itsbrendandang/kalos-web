"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { EmptyState } from "@/components/ui/honest-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlateHeatmap } from "@/components/plate/plate-heatmap";
import { QcTiles } from "@/components/plate/qc-tiles";
import { WellStatusLegend } from "@/components/plate/well-status-legend";
import { FlagSummary } from "@/components/plate/flag-summary";
import { ControlSummary } from "@/components/plate/control-summary";
import { WellDetail } from "@/components/plate/well-detail";
import { StatusChip } from "@/components/plate/status-chip";
import { PageHeader, DemoBadge } from "@/components/page-header";
import { PLATE } from "@/lib/plate-data";
import { cn } from "@/lib/utils";
import { lazyChart } from "@/components/kit/lazy-chart";

type ViewTab = "overview" | "dose";

/**
 * Plate Summary: 96-well QC heatmap, control/flag summaries, and a per-well
 * growth-curve detail. Renders from the deterministic seed data in
 * lib/plate-data.ts - see that file for the real-API integration point.
 */
const GrowthCurve = lazyChart(() => import("@/components/plate/growth-curve").then((m) => m.GrowthCurve));

export default function PlatePage() {
  const [selectedWellId, setSelectedWellId] = useState(PLATE.defaultWellId);
  const [showFlags, setShowFlags] = useState(false);
  const [showValues, setShowValues] = useState(false);
  const [activePlate, setActivePlate] = useState<"1" | "2">("1");
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");
  const [exported, setExported] = useState(false);

  const well = PLATE.wells[selectedWellId];
  const partner = well.pairWith ? PLATE.wells[well.pairWith] : undefined;
  const base = PLATE.pairBase[well.pairId];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Plate Summary - Nitrogen Source · PID-107 · E. coli · 2 plates"
        desc="kalos plate analysis · simulated 96-well nitrogen-source screen."
        action={<DemoBadge />}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ViewTab)} className="gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="inline-flex gap-0.5 rounded-lg border border-border bg-surface p-0.5">
                {(["1", "2"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setActivePlate(p)}
                    aria-pressed={activePlate === p}
                    className={cn(
                      "h-8 rounded-md px-3 text-label transition-colors",
                      activePlate === p ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    Plate {p === "1" ? "01" : "02"}
                  </button>
                ))}
              </div>
              <TabsList variant="line">
                <TabsTrigger value="overview">Plate overview</TabsTrigger>
                <TabsTrigger value="dose">Dose-response</TabsTrigger>
              </TabsList>
            </div>
            {activePlate === "2" ? (
              <p className="mt-2 text-caption text-fg-muted">Plate 02 data is not included in this demo.</p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Button variant="outline" onClick={() => setExported(true)}>
              Export plate report
            </Button>
            {exported ? (
              <span className="text-caption text-fg-muted">Export queued - demo only, no backend attached.</span>
            ) : null}
          </div>
        </div>

        <QcTiles
          totalWells={PLATE.wellIds.length}
          wellsWithData={PLATE.expIds.length}
          passCount={PLATE.passCount}
          warnCount={PLATE.warnCount}
          failCount={PLATE.failCount}
          controlCount={PLATE.controlIds.length}
          duplicatePairCount={PLATE.duplicatePairCount}
        />

        <TabsContent value="overview" className="mt-5 flex flex-col gap-3.5">
          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-label text-fg">
                  96-well plate heatmap{" "}
                  <span className="ml-1.5 text-caption text-fg-muted">colored by ΔOD (max − t₀)</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex h-10 cursor-pointer items-center gap-1 text-label text-fg select-none">
                    <Checkbox checked={showFlags} onChange={(e) => setShowFlags(e.target.checked)} />
                    Show flags
                  </label>
                  <label className="inline-flex h-10 cursor-pointer items-center gap-1 text-label text-fg select-none">
                    <Checkbox checked={showValues} onChange={(e) => setShowValues(e.target.checked)} />
                    Show values
                  </label>
                </div>
              </div>
              <PlateHeatmap
                wells={PLATE.wells}
                deltaMin={PLATE.deltaMin}
                deltaMax={PLATE.deltaMax}
                selectedWellId={selectedWellId}
                onSelect={setSelectedWellId}
                showFlags={showFlags}
                showValues={showValues}
              />
            </Card>

            <div className="flex min-w-0 flex-col gap-3.5">
              <Card>
                <h2 className="mb-3 text-label text-fg">Well status</h2>
                <WellStatusLegend />
              </Card>
              <Card>
                <h2 className="mb-3 text-label text-fg">Well flag summary</h2>
                <FlagSummary
                  flagCatCounts={PLATE.flagCatCounts}
                  flaggedWellCount={PLATE.flaggedWellCount}
                  totalWells={PLATE.wellIds.length}
                />
              </Card>
              <Card>
                <h2 className="mb-3 text-label text-fg">Control summary</h2>
                <ControlSummary
                  zPrime={PLATE.zPrime}
                  controlCV={PLATE.controlCV}
                  posMean={PLATE.posMean}
                  negMean={PLATE.negMean}
                />
              </Card>
            </div>
          </div>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-label text-fg">
                  Growth curve <span className="ml-1.5 text-caption text-fg-muted">OD vs time (0-24 h)</span>
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-fg-muted">
                  <span className="font-mono text-code text-fg">{well.id}</span>
                  <span>{well.condition}</span>
                  {well.status ? <StatusChip status={well.status} /> : null}
                </div>
              </div>
              <Dialog>
                <DialogTrigger render={<Button variant="outline" size="sm" />}>View well detail</DialogTrigger>
                <DialogContent className="max-w-md">
                  <WellDetail well={well} />
                </DialogContent>
              </Dialog>
            </div>
            <GrowthCurve well={well} partner={partner} base={base} />
          </Card>
        </TabsContent>

        <TabsContent value="dose" className="mt-5">
          <Card>
            <EmptyState
              icon={FlaskConical}
              title="Dose-response is not in this demo"
              description="This screen would plot ΔOD vs. dose per nitrogen source, pulled from the full kalos plate-analysis pipeline."
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
