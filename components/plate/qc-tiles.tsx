import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusChip } from "@/components/plate/status-chip";

interface QcTilesProps {
  totalWells: number;
  wellsWithData: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  controlCount: number;
  duplicatePairCount: number;
}

/** Top-row QC summary tiles: totals, Pass/Warn/Fail, controls, duplicates. */
export function QcTiles({
  totalWells,
  wellsWithData,
  passCount,
  warnCount,
  failCount,
  controlCount,
  duplicatePairCount,
}: QcTilesProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      <StatTile label="Total wells" value={totalWells} />
      <StatTile
        label="Wells with data"
        value={wellsWithData}
        tooltip="Experimental (non-control) wells with a measured growth curve."
      />
      <Card className="flex h-[76px] flex-col justify-center gap-1.5 rounded-xl bg-blue-soft px-3.5 py-2">
        <div className="text-[10.5px] font-semibold tracking-wide text-muted uppercase">Pass / Warn / Fail</div>
        <div className="flex flex-wrap items-baseline gap-1 text-[15px]">
          <StatusChip status="pass" count={passCount} />
          <span className="text-muted">/</span>
          <StatusChip status="warn" count={warnCount} />
          <span className="text-muted">/</span>
          <StatusChip status="fail" count={failCount} />
        </div>
      </Card>
      <StatTile label="Controls" value={controlCount} />
      <StatTile label="Duplicates" value={`${duplicatePairCount} pairs`} />
    </div>
  );
}
