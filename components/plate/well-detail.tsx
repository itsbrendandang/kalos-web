import { STATUS_LABEL } from "@/components/plate/status-chip";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Well } from "@/lib/plate-data";

const STATUS_TEXT = { pass: "text-green", warn: "text-amber", fail: "text-red" } as const;
const STATUS_DOT = { pass: "bg-green", warn: "bg-amber", fail: "bg-red" } as const;

function MetricBox({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mb-0.5 text-caption font-semibold text-fg-muted">{k}</div>
      <div className="tabular-nums text-heading font-semibold text-fg">{v}</div>
    </div>
  );
}

function StatusLine({ well }: { well: Well }) {
  if (well.isControl || well.status === null) {
    return (
      <div className="mb-3 flex items-center gap-2 text-label font-semibold">
        <span className="inline-block size-2 rounded-[2px] bg-muted" />
        <span className="text-fg-muted">Control well (not scored Pass/Warn/Fail)</span>
      </div>
    );
  }
  const status = well.status;
  return (
    <div className={cn("mb-3 flex items-center gap-2 text-label font-semibold", STATUS_TEXT[status])}>
      <span className={cn("inline-block size-2 rounded-[2px]", STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </div>
  );
}

interface WellDetailProps {
  well: Well;
}

/** Selected-well detail: condition, status, metrics, and flags. Rendered
 *  inside a Dialog (app/plate/page.tsx) - it owns the dialog's title/description
 *  rather than a plain heading, so it stays correct wherever it is mounted. */
export function WellDetail({ well: w }: WellDetailProps) {
  const m = w.metrics;
  return (
    <div>
      <DialogHeader>
        <DialogTitle>
          Well detail{" "}
          <span className="rounded-lg bg-accent-soft px-2 py-0.5 text-heading text-accent">{w.id}</span>
        </DialogTitle>
        <DialogDescription>
          {w.condition}
          {w.isControl ? "" : ` · replicate ${w.replicate} of ${w.pairId}`}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-3.5">
        <StatusLine well={w} />

        <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <MetricBox k="Δ OD (max − t₀)" v={m.deltaOD.toFixed(3)} />
          <MetricBox k="Max OD (raw)" v={m.maxOD.toFixed(3)} />
          <MetricBox k="Growth rate (1/h)" v={m.growthRate.toFixed(3)} />
          <MetricBox k="Lag time (h)" v={m.lag.toFixed(2)} />
          <MetricBox k="SGT (h)" v={m.sgtReached ? m.sgt.toFixed(1) : "> 24"} />
          <MetricBox k="AUC (ΔOD)" v={m.auc.toFixed(2)} />
        </div>
        <p className="mb-3 text-caption leading-relaxed text-fg-muted">
          SGT = time to first cross ΔOD ≥ 0.05 above t₀. AUC = trapezoidal integral of ΔOD over 0-24 h.
        </p>

        <div className="mb-1.5 text-caption font-semibold text-fg-muted">Flags</div>
        {w.flags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {w.flags.map((f, i) => (
              <span
                key={i}
                className="rounded-full border border-border bg-bg px-2.5 py-1 text-caption font-semibold text-fg"
              >
                <span className="mr-1 font-semibold text-fg-muted">{f.cat}</span>
                {f.label}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-caption text-fg-muted">No flags on this well.</span>
        )}
      </div>
    </div>
  );
}
