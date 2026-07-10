import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/plate/status-chip";

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] font-semibold text-muted uppercase">{label}</div>
      <div className="tabular mt-1.5 font-mono text-[20px] font-semibold text-fg">{value}</div>
    </Card>
  );
}

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
      <Tile label="Total wells" value={totalWells} />
      <Tile label="Wells with data" value={wellsWithData} />
      <Card className="p-3">
        <div className="text-[11px] font-semibold text-muted uppercase">Pass / Warn / Fail</div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-1 text-[15px]">
          <StatusChip status="pass" count={passCount} />
          <span className="text-muted">/</span>
          <StatusChip status="warn" count={warnCount} />
          <span className="text-muted">/</span>
          <StatusChip status="fail" count={failCount} />
        </div>
      </Card>
      <Tile label="Controls" value={controlCount} />
      <Tile label="Duplicates" value={`${duplicatePairCount} pairs`} />
    </div>
  );
}
