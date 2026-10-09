import { calibrationNote, type AnalyzeResult } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { num } from "@/lib/utils";

/** Engine diagnostics: omitted groups stay omitted; unavailable values stay unmeasured. */
export function AnalysisDiagnostics({ d }: { d: Pick<AnalyzeResult, "noise" | "alternative_scale" | "gp_shapes"> }) {
  const { noise, alternative_scale: alt, gp_shapes: shapes } = d;
  if (!noise && !alt && !shapes) return null;
  const value = (n: number | null) => n == null ? "n/a (not measured)" : num(n, 2);
  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
      {noise ? (
        <Card className="text-[12px] text-muted">
          <h3 className="text-[15px] font-semibold text-fg">Assay noise &amp; replication</h3>
          <p className="mt-1">{noise.n_recipes} recipes · {noise.n_replicated} replicated · fit {noise.replicate_aware ? "replicate-aware" : "not replicate-aware"}</p>
          <p className="mt-2">ICC: {value(noise.icc)} · noise SD: {value(noise.noise_sd)} · signal SD: {value(noise.signal_sd)}</p>
          <p>Best single run: {value(noise.best_single)} · best reproducible recipe: {value(noise.best_reproducible)}</p>
          <p className="mt-1">Unavailable noise estimates are not evidence of zero noise; the engine reports no reason for individual missing estimates.</p>
          {noise.scale ? (
            <div className="mt-2 border-t border-border pt-2">
              <p>Variance/mean ρ: {value(noise.scale.variance_mean_rho)} · homoscedastic: {noise.scale.homoscedastic == null ? "not measured" : noise.scale.homoscedastic ? "yes" : "no"}</p>
              <p>ICC raw: {value(noise.scale.icc_raw)} · log: {value(noise.scale.icc_log)} · gain: {value(noise.scale.icc_gain)}</p>
              <p>Log offset: {value(noise.scale.log_offset)} · transform suggested: {noise.scale.suggests_transform ? "yes" : "no"}</p>
              {noise.scale.reason ? <p className="mt-1">{noise.scale.reason}</p> : null}
            </div>
          ) : <p className="mt-2">Scale diagnostic unavailable — no result or reason reported by the engine.</p>}
        </Card>
      ) : null}
      {alt ? (
        <Card className="text-[12px] text-muted">
          <h3 className="text-[15px] font-semibold text-fg">Alternative-scale evaluation</h3>
          <p className="mt-1">{alt.scale === "log1p" ? `log1p wire label means log(y + offset); offset: ${value(alt.offset)}.` : "Transform unavailable — no alternative scale reported."}</p>
          <p className="mt-2">Held-out Spearman: {value(alt.cv_spearman)} · 95% CI: {alt.cv_ci95 ? alt.cv_ci95.map((n) => num(n, 2)).join(" to ") : "n/a (not measured)"}</p>
          <p>ICC: {value(alt.icc)}</p>
          <p>Calibration: {calibrationNote(alt.calibration) ?? "n/a — not reported by the engine."}</p>
          {alt.calibration?.available ? alt.calibration.levels.map((level) => <p key={level.nominal}>{num(level.nominal * 100, 0)}% nominal → {num(level.empirical * 100, 0)}% empirical</p>) : null}
          {alt.interpretation ? <p className="mt-2">{alt.interpretation}</p> : null}
          {alt.reason ? <p className="mt-1">{alt.reason}</p> : null}
        </Card>
      ) : null}
      {shapes ? (
        <Card className="text-[12px] text-muted lg:col-span-2">
          <h3 className="text-[15px] font-semibold text-fg">GP response shapes</h3>
          <p className="mt-1">ARD model relevance describes the fitted model, not causal importance. Swept at: {shapes.swept_at} · {shapes.n_features} features.</p>
          {!shapes.available ? <p className="mt-2">Unavailable — {shapes.reason ?? "the engine did not report a reason"}.</p> : (
            <div className="mt-2 divide-y divide-border">
              {shapes.features.length === 0 ? <p>No feature shapes reported.</p> : shapes.features.map((f) => (
                <div key={f.name} className="py-2">
                  <p className="font-semibold text-fg">{f.name} · {f.shape.replaceAll("_", " ")}</p>
                  <p>Model relevance: {value(f.relevance)} · lengthscale: {value(f.lengthscale)} · Spearman ρ: {value(f.spearman_rho)}</p>
                  <p>Optimum at: {value(f.optimum_at)} · peak gain: {value(f.peak_gain)} · peak separation SD: {value(f.peak_separation_sd)}</p>
                  {f.missed_by_spearman ? <p>Shape missed by Spearman ranking.</p> : null}
                </div>
              ))}
            </div>
          )}
          {shapes.available && shapes.reason ? <p>{shapes.reason}</p> : null}
          {shapes.unmodeled.length ? <p className="mt-2">Unmodeled: {shapes.unmodeled.join(" · ")}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
