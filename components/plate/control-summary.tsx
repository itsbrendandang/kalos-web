interface ControlSummaryProps {
  zPrime: number | null;
  controlCV: number | null;
  posMean: number;
  negMean: number;
}

/** Z'-factor and control CV, computed from the positive/negative control wells. */
export function ControlSummary({ zPrime, controlCV, posMean, negMean }: ControlSummaryProps) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-y-2 text-caption">
        <div className="text-fg-muted">Z′ score</div>
        <div className="tabular-nums text-right font-semibold">{zPrime === null ? "n/a" : zPrime.toFixed(2)}</div>
        <div className="text-fg-muted">+ Control CV %</div>
        <div className="tabular-nums text-right font-semibold">
          {controlCV === null ? "n/a" : `${controlCV.toFixed(1)}%`}
        </div>
        <div className="text-fg-muted">+ Control mean ΔOD</div>
        <div className="tabular-nums text-right font-semibold">{posMean.toFixed(3)}</div>
        <div className="text-fg-muted">− Control mean ΔOD</div>
        <div className="tabular-nums text-right font-semibold">{negMean.toFixed(3)}</div>
      </div>
      <div className="mt-2 text-caption leading-relaxed text-fg-muted">
        Z′ = 1 − 3(σ₊ + σ₋) / |μ₊ − μ₋|, computed from the 12 positive / 12 negative control wells. Can be negative
        when control separation is weak - that is reported as-is. Shown as n/a when control separation or the
        positive-control mean is ~0.
      </div>
    </div>
  );
}
