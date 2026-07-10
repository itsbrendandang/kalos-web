interface ControlSummaryProps {
  zPrime: number;
  controlCV: number;
  posMean: number;
  negMean: number;
}

/** Z'-factor and control CV, computed from the positive/negative control wells. */
export function ControlSummary({ zPrime, controlCV, posMean, negMean }: ControlSummaryProps) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-y-2 text-[12.5px]">
        <div className="text-muted">Z′ score</div>
        <div className="tabular text-right font-mono font-bold">{zPrime.toFixed(2)}</div>
        <div className="text-muted">Control CV %</div>
        <div className="tabular text-right font-mono font-bold">{controlCV.toFixed(1)}%</div>
        <div className="text-muted">+ Control mean ΔOD</div>
        <div className="tabular text-right font-mono font-bold">{posMean.toFixed(3)}</div>
        <div className="text-muted">− Control mean ΔOD</div>
        <div className="tabular text-right font-mono font-bold">{negMean.toFixed(3)}</div>
      </div>
      <div className="mt-2 text-[11px] leading-relaxed text-muted">
        Z′ = 1 − 3(σ₊ + σ₋) / |μ₊ − μ₋|, computed from the 12 positive / 12 negative control wells. Can be negative
        when control separation is weak - that is reported as-is.
      </div>
    </div>
  );
}
