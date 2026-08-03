"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlateHeatmap } from "@/components/plate/plate-heatmap";
import { QcTiles } from "@/components/plate/qc-tiles";
import { WellStatusLegend } from "@/components/plate/well-status-legend";
import { FlagSummary } from "@/components/plate/flag-summary";
import { ControlSummary } from "@/components/plate/control-summary";
import { WellDetail } from "@/components/plate/well-detail";
import { GrowthCurve } from "@/components/plate/growth-curve";
import { PageHeader, DemoBadge } from "@/components/page-header";
import { PLATE } from "@/lib/plate-data";
import { cn } from "@/lib/utils";

type ViewTab = "overview" | "dose";

/**
 * Plate Summary: 96-well QC heatmap, control/flag summaries, and a per-well
 * growth-curve detail. Renders from the deterministic seed data in
 * lib/plate-data.ts - see that file for the real-API integration point.
 */
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
        title="Plate Summary — Nitrogen Source · PID-107 · E. coli · 2 plates"
        desc="Bioqore plate analysis · simulated 96-well nitrogen-source screen."
        action={<DemoBadge />}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="inline-flex gap-0.5 rounded-[10px] border border-border bg-card p-0.5">
              {(["1", "2"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActivePlate(p)}
                  className={cn(
                    "rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                    activePlate === p ? "bg-accent text-[color:var(--primary-foreground)]" : "text-muted hover:text-fg",
                  )}
                >
                  Plate {p === "1" ? "01" : "02"}
                </button>
              ))}
            </div>
            <div className="inline-flex gap-4 border-b-2 border-border">
              {(["overview", "dose"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTab(t)}
                  className={cn(
                    "-mb-0.5 border-b-2 pb-2 text-[13px] font-semibold transition-colors",
                    activeTab === t ? "border-accent text-blue-deep" : "border-transparent text-muted hover:text-fg",
                  )}
                >
                  {t === "overview" ? "Plate overview" : "Dose-response"}
                </button>
              ))}
            </div>
          </div>
          {activePlate === "2" ? (
            <p className="mt-2 text-[11.5px] text-muted">Plate 02 data is not included in this demo.</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button variant="outline" onClick={() => setExported(true)}>
            Export plate report
          </Button>
          {exported ? (
            <span className="text-[11px] text-muted">Export queued - demo only, no backend attached.</span>
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

      {activeTab === "overview" ? (
        <>
          <div className="grid gap-3.5 lg:grid-cols-[1.62fr_1fr]">
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold text-fg">
                  96-well plate heatmap{" "}
                  <span className="ml-1.5 text-[11.5px] font-medium text-muted">colored by ΔOD (max − t₀)</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  <label
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold select-none",
                      showFlags ? "border-blue-border bg-blue-tint text-blue-deep" : "border-border text-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={showFlags}
                      onChange={(e) => setShowFlags(e.target.checked)}
                      className="size-3.5"
                      style={{ accentColor: "var(--blue)" }}
                    />
                    Show flags
                  </label>
                  <label
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold select-none",
                      showValues ? "border-blue-border bg-blue-tint text-blue-deep" : "border-border text-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={showValues}
                      onChange={(e) => setShowValues(e.target.checked)}
                      className="size-3.5"
                      style={{ accentColor: "var(--blue)" }}
                    />
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

            <div className="flex flex-col gap-3.5">
              <Card>
                <h2 className="mb-3 text-[13px] font-bold text-fg">Well status</h2>
                <WellStatusLegend />
              </Card>
              <Card>
                <h2 className="mb-3 text-[13px] font-bold text-fg">Well flag summary</h2>
                <FlagSummary
                  flagCatCounts={PLATE.flagCatCounts}
                  flaggedWellCount={PLATE.flaggedWellCount}
                  totalWells={PLATE.wellIds.length}
                />
              </Card>
              <Card>
                <h2 className="mb-3 text-[13px] font-bold text-fg">Control summary</h2>
                <ControlSummary
                  zPrime={PLATE.zPrime}
                  controlCV={PLATE.controlCV}
                  posMean={PLATE.posMean}
                  negMean={PLATE.negMean}
                />
              </Card>
            </div>
          </div>

          <div className="grid gap-3.5 lg:grid-cols-[0.9fr_1.6fr]">
            <Card>
              <WellDetail well={well} />
            </Card>
            <Card>
              <h2 className="mb-3 text-[13px] font-bold text-fg">
                Growth curve <span className="ml-1.5 text-[11.5px] font-medium text-muted">OD vs time (0-24 h)</span>
              </h2>
              <GrowthCurve well={well} partner={partner} base={base} />
            </Card>
          </div>
        </>
      ) : (
        <Card className="py-16 text-center text-[13px] text-muted">
          Dose-response view is not included in this demo - this screen would plot ΔOD vs. dose per nitrogen source,
          pulled from the full Bioqore plate-analysis pipeline.
        </Card>
      )}
    </div>
  );
}
