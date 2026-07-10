import { seqColor } from "@/components/dashboard/heat-scale";

const BANDS = [
  { t: 0.92, label: "High" },
  { t: 0.66, label: "Good" },
  { t: 0.38, label: "Low" },
  { t: 0.12, label: "Very Low" },
];

/** Reads the blue heatmap ramp + well marks (control, flag) for the side panel. */
export function WellStatusLegend() {
  return (
    <div>
      {BANDS.map((b) => (
        <div key={b.label} className="flex items-center gap-2.5 py-1 text-[12.5px]">
          <span
            className="size-4 shrink-0 rounded border border-border"
            style={{ background: seqColor(b.t, 0, 1) }}
          />
          {b.label}
        </div>
      ))}
      <div className="flex items-center gap-2.5 py-1 text-[12.5px]">
        <span
          className="size-4 shrink-0 rounded border border-border"
          style={{
            background:
              "repeating-linear-gradient(45deg, var(--border), var(--border) 3px, var(--card) 3px, var(--card) 6px)",
          }}
        />
        No data
      </div>
      <div className="flex items-center gap-2.5 py-1 text-[12.5px]">
        <span className="w-4 text-center font-mono font-bold text-blue-deep">+</span>
        MRS positive control
      </div>
      <div className="flex items-center gap-2.5 py-1 text-[12.5px]">
        <span className="w-4 text-center font-mono font-bold text-blue-deep">−</span>
        Control / blank
      </div>
      <div className="flex items-center gap-2.5 py-1 text-[12.5px]">
        <span className="w-4 text-center font-mono font-bold text-fg">⚑</span>
        Flagged well
      </div>
      <div className="mt-1.5 text-[11px] text-muted">
        &ldquo;No data&rdquo; is a reserved category for missing reads - not present in this simulated run.
      </div>
    </div>
  );
}
