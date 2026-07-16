import { cn } from "@/lib/utils";

function Tile({ label, value, amber = false }: { label: string; value: number; amber?: boolean }) {
  return (
    <div className="flex min-h-[96px] flex-col justify-center p-4">
      <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">{label}</div>
      <div className={cn("tabular mt-1.5 font-mono text-[26px] leading-none font-semibold", amber && value > 0 ? "text-amber" : "text-fg")}>
        {value}
      </div>
    </div>
  );
}

/** The at-a-glance summary row: running / needs attention / queued / completed
 *  today. Matches the KPI-strip look used on the Results page for parity. */
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
    <div className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
      <Tile label="Running" value={running} />
      <Tile label="Needs attention" value={attention} amber />
      <Tile label="In queue" value={queued} />
      <Tile label="Completed today" value={completedToday} />
    </div>
  );
}
