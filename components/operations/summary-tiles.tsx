import { StatTile } from "@/components/ui/stat-tile";

/** The at-a-glance summary row: running / needs attention / queued / completed
 *  today, on the shared `StatTile` primitive (components/ui/stat-tile.tsx). */
export function SummaryTiles({
  running,
  attention,
  queued,
  completedToday,
}: {
  running: number;
  attention: number;
  queued: number;
  completedToday: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Running" value={running} />
      <StatTile
        label="Needs attention"
        value={<span className={attention > 0 ? "text-amber" : undefined}>{attention}</span>}
      />
      <StatTile label="In queue" value={queued} />
      <StatTile label="Completed today" value={completedToday} />
    </div>
  );
}
