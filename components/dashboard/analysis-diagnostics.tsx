import { Fragment, type ReactNode } from "react";
import { calibrationNote, type Diagnostics } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, num } from "@/lib/utils";

type Props = { d: Partial<Diagnostics> };

const SHAPE_LABEL: Record<Diagnostics["gp_shapes"]["features"][number]["shape"], string> = {
  flat: "flat",
  monotonic_up: "rises",
  monotonic_down: "falls",
  interior_optimum: "interior peak",
  interior_minimum: "interior dip",
};

/**
 * The engine's noise, log-scale and GP-shape diagnostics, in the same bordered
 * idiom as EvaluationChecks. A block the engine omits stays omitted; a value it
 * could not estimate says "not measured" rather than reading as zero.
 */
export function AnalysisDiagnostics({ d }: Props) {
  const { noise, alternative_scale: alt, gp_shapes: shapes } = d;
  if (!noise && !alt && !shapes) return null;
  return (
    <div className="mt-4">
      <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Engine diagnostics</div>
      <div className={cn("mt-2 grid items-start gap-2.5", noise && alt && "lg:grid-cols-2")}>
        {noise ? <NoiseBox noise={noise} /> : null}
        {alt ? <AltScaleBox alt={alt} sameReasonAsScale={alt.reason != null && alt.reason === noise?.scale?.reason} /> : null}
      </div>
      {shapes ? <ShapesBox shapes={shapes} /> : null}
    </div>
  );
}

function NoiseBox({ noise }: { noise: Diagnostics["noise"] }) {
  const s = noise.scale;
  const scaleMeasured = s != null && [s.variance_mean_rho, s.icc_raw, s.icc_log].some((v) => v != null);
  return (
    <Box
      title="Assay noise & replication"
      sub={`${noise.n_recipes} recipes · ${noise.n_replicated} replicated · proposals fit on ${noise.replicate_aware ? "replicate means" : "single runs"}`}
    >
      <Facts
        rows={[
          ["ICC", value(noise.icc, 3)],
          ["Noise SD", value(noise.noise_sd)],
          ["Signal SD", value(noise.signal_sd)],
          ["Best single run", value(noise.best_single)],
          ["Best reproducible recipe", value(noise.best_reproducible)],
        ]}
      />
      {[noise.icc, noise.noise_sd, noise.signal_sd].includes(null) ? (
        <Note>Not measured means too few recipes or replicates to estimate it, not zero noise.</Note>
      ) : null}
      <div className="mt-2.5 border-t border-border pt-2.5">
        {s && scaleMeasured ? (
          <>
            <Facts
              rows={[
                ["Variance vs mean ρ", value(s.variance_mean_rho)],
                ["Homoscedastic", s.homoscedastic == null ? notMeasured : s.homoscedastic ? "yes" : "no"],
                ["ICC raw → log", s.icc_raw == null || s.icc_log == null ? notMeasured : `${num(s.icc_raw, 3)} → ${num(s.icc_log, 3)}`],
                ["Log scale suggested", s.suggests_transform ? "yes" : "no"],
              ]}
            />
            {s.reason ? <Note>{s.reason}</Note> : null}
          </>
        ) : (
          <Note className="mt-0">
            {s ? `Variance check not run: ${s.reason ?? "the engine gave no reason"}.` : "Variance check not reported by this engine."}
          </Note>
        )}
      </div>
    </Box>
  );
}

function AltScaleBox({ alt, sameReasonAsScale }: { alt: Diagnostics["alternative_scale"]; sameReasonAsScale: boolean }) {
  if (alt.scale == null) {
    return (
      <Box title="Log-scale evaluation">
        <Note className="mt-1">
          {sameReasonAsScale
            ? "Not run, for the same reason as the variance check."
            : `Not run: ${alt.reason ?? "the engine gave no reason"}.`}
        </Note>
      </Box>
    );
  }
  const calibration = calibrationNote(alt.calibration);
  return (
    <Box
      title="Log-scale evaluation"
      // Offsets are often tiny (0.0003), so two fixed decimals would print "+ 0.00".
      sub={`Held-out evaluation on log(y + ${alt.offset == null ? "offset" : Number(alt.offset.toPrecision(2))}).`}
    >
      <Facts
        rows={[
          ["Held-out Spearman", value(alt.cv_spearman)],
          ["95% CI", alt.cv_ci95 ? `${num(alt.cv_ci95[0], 2)} to ${num(alt.cv_ci95[1], 2)}` : notMeasured],
          ["ICC", value(alt.icc, 3)],
          ...(alt.calibration?.available
            ? alt.calibration.levels.map((l): [string, ReactNode] => [`${num(l.nominal * 100, 0)}% band covers`, `${num(l.empirical * 100, 0)}%`])
            : []),
        ]}
      />
      {calibration ? <Note>{calibration}</Note> : null}
      <Note>{alt.interpretation ?? "Evaluation only: proposals and every other number stay on the raw scale."}</Note>
      {alt.reason && !sameReasonAsScale ? <Note>{alt.reason}</Note> : null}
    </Box>
  );
}

function ShapesBox({ shapes }: { shapes: Diagnostics["gp_shapes"] }) {
  return (
    <Box
      className="mt-2.5"
      title="GP response shapes"
      sub={`How the fitted model's prediction moves along each feature, other features held at the ${shapes.swept_at}. Relevance describes the model, not causation.`}
    >
      {!shapes.available ? (
        <Note>Unavailable: {shapes.reason ?? "the engine gave no reason"}.</Note>
      ) : shapes.features.length === 0 ? (
        <Note>No feature shapes reported.</Note>
      ) : (
        <Table className="tabular mt-2 text-[12px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Feature", "Shape", "Relevance", "Optimum at", "Peak gain", "Peak sep. (SD)", "Spearman"].map((h, i) => (
                <TableHead key={h} className={cn("h-auto px-2 py-1.5 text-[10px] font-semibold text-muted uppercase", i > 1 && "text-right")}>
                  {h}
                  {/* Lowercase rho: uppercasing it renders a capital Rho that reads as "P". */}
                  {h === "Spearman" ? <span className="normal-case"> ρ</span> : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shapes.features.map((f) => (
              <TableRow key={f.name} className="hover:bg-blue-soft">
                <TableCell className="px-2 py-1.5 font-mono text-fg">{f.name}</TableCell>
                <TableCell className="px-2 py-1.5 text-fg">
                  {SHAPE_LABEL[f.shape]}
                  {f.missed_by_spearman ? (
                    <span
                      className="ml-1.5 rounded-full bg-amber-soft px-1.5 py-px text-[10px] font-medium text-amber"
                      title="Spearman ρ alone would mislead about this feature"
                    >
                      rank misses it
                    </span>
                  ) : null}
                </TableCell>
                {[f.relevance, f.optimum_at, f.peak_gain, f.peak_separation_sd, f.spearman_rho].map((v, i) => (
                  <TableCell key={i} className="px-2 py-1.5 text-right font-mono text-fg">
                    {v == null ? <span className="text-muted">-</span> : num(v, 2)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {shapes.available && shapes.reason ? <Note>{shapes.reason}</Note> : null}
      {shapes.available && shapes.features.some((f) => f.optimum_at == null) ? (
        <Note>Optimum and peak columns apply only to interior shapes.</Note>
      ) : null}
      {shapes.unmodeled.length ? <Note>Not modeled: {shapes.unmodeled.join(" · ")}.</Note> : null}
    </Box>
  );
}

const notMeasured = <span className="font-sans text-muted">not measured</span>;
const value = (n: number | null, digits = 2) => (n == null ? notMeasured : num(n, digits));

function Box({ title, sub, className, children }: { title: string; sub?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-[10px] border border-border bg-card p-3", className)}>
      <div className="text-[12px] font-medium text-fg">{title}</div>
      {sub ? <p className="mt-0.5 text-[12px] leading-snug text-muted">{sub}</p> : null}
      {children}
    </div>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[12px]">
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="text-muted">{k}</dt>
          <dd className="tabular text-right font-mono text-fg">{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-2 text-[12px] leading-snug text-muted", className)}>{children}</p>;
}
