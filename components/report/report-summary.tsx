import type { ReactNode } from "react";
import { MeasuredMark, PredictedValue } from "@/components/campaign/plan/marks";
import { promotionLine } from "@/components/campaign/learn";
import { targetName } from "@/components/campaign/target";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { Verdict } from "@/components/kit/verdict";
import { ModeBadge } from "@/components/ui/badge";
import { calibrationNote, type Promotion } from "@/lib/api";
import { formatBand, formatNumber, formatRange } from "@/lib/format";
import type { DataPackage } from "@/lib/report-package";
import { parseUnit } from "@/lib/utils";

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n, "count")} ${n === 1 ? one : many}`;

/** A label and its value on one row of a definition list. */
export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 border-t border-border py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <dt className="text-label text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-body text-fg">{children}</dd>
    </div>
  );
}

export function ObjectiveSection({ pkg }: { pkg: DataPackage }) {
  const target = pkg.objective.target;
  return (
    <Section id="objective" title="Objective">
      <p className="text-body text-fg">
        {target ? (
          <>
            Maximize <span className="font-mono text-code">{target}</span>.
          </>
        ) : (
          "No target has been chosen yet."
        )}{" "}
        <span className="text-fg-muted">
          The engine only maximizes, and it searches inside the observed range of each input in the uploaded sheet, which is not an operating range.
        </span>
      </p>
    </Section>
  );
}

export function EvidenceSection({ pkg }: { pkg: DataPackage }) {
  const e = pkg.evidence;
  const unit = pkg.objective.target ? parseUnit(pkg.objective.target) : "";
  const label = pkg.objective.target ? targetName(pkg.objective.target) : "the target";
  return (
    <Section id="evidence" title="Evidence" description="Measured values only. Nothing in this section is a prediction.">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-label text-fg-muted">
          <MeasuredMark />
          Best measured {label} so far
        </p>
        <p className="flex items-baseline gap-1.5">
          <span className="text-metric text-fg tabular-nums">{formatNumber(e.best_measured)}</span>
          {unit && e.best_measured != null ? <span className="text-body text-fg-muted">{unit}</span> : null}
        </p>
        <p className="text-body text-fg-muted">
          From {e.n_base_rows != null ? plural(e.n_base_rows, "measured row") : "n/a measured rows"} in the model&apos;s base data. Campaign runs:{" "}
          {formatNumber(e.n_measured_runs, "count")} measured, {formatNumber(e.n_awaiting_runs, "count")} awaiting a result.
        </p>
      </div>
      {pkg.history.length > 1 ? (
        <dl>
          {pkg.history.map((h) => (
            <Fact key={h.round} label={h.round === 0 ? "Uploaded sheet" : `After re-analysis ${h.round}`}>
              <span className="tabular-nums">{formatNumber(h.best_measured)}</span>
              <span className="text-fg-muted"> best measured, {h.n_base != null ? plural(h.n_base, "row") : "n/a rows"}</span>
            </Fact>
          ))}
        </dl>
      ) : null}
    </Section>
  );
}

function promotionText(p: NonNullable<DataPackage["model"]["promotion"]>): string {
  if (p.passed) return "Cleared the engine's promotion checks.";
  return promotionLine(p as Promotion) ?? "Not yet shown fit to promote.";
}

export function ModelSection({ pkg }: { pkg: DataPackage }) {
  const m = pkg.model;
  const rel = m.reliability;
  const significant = m.drivers.filter((d) => d.significant).length;
  const calibration = calibrationNote(m.calibration);
  return (
    <Section id="model" title="Model" description="How far the model's predictions can be trusted, as the engine scored it on held-out runs.">
      <Verdict
        tone={rel.verdict === "reliable" ? "good" : "neutral"}
        detailLabel="Engine values"
        detail={
          <dl className="grid gap-1">
            <div>
              Trust floor: <span className="tabular-nums">{formatNumber(rel.engine?.spearman_floor, "corr")}</span>
            </div>
            <div>Clears floor: {rel.engine ? (rel.engine.clears_floor ? "yes" : "no") : "n/a"}</div>
            <div>95% interval excludes zero: {rel.engine ? (rel.engine.ci_excludes_zero ? "yes" : "no") : "n/a"}</div>
          </dl>
        }
      >
        {rel.label}. <span className="text-body text-fg-muted">{rel.reason}</span>
      </Verdict>
      <dl>
        <Fact label="Held-out rank agreement">
          <span className="tabular-nums">rho {formatNumber(m.cv_spearman, "corr")}</span>
          <span className="text-fg-muted"> (95% CI {m.cv_ci95 ? formatRange(m.cv_ci95[0], m.cv_ci95[1], "corr") : "n/a"})</span>
        </Fact>
        <Fact label="Prediction band">
          <span className="tabular-nums">{m.conformal.half_width != null ? formatBand(m.conformal.half_width, m.conformal.coverage) : "n/a"}</span>
          <span className="text-fg-muted"> around each predicted value, from held-out errors.</span>
        </Fact>
        <Fact label="Band calibration">{calibration ?? <span className="text-fg-muted">n/a: the engine did not report it.</span>}</Fact>
        <Fact label="Promotion">
          {m.promotion ? (
            <>
              {promotionText(m.promotion)} <span className="text-fg-muted">Reported, not enforced: the analysis is still shown and used.</span>
              <Disclosure summary="Engine's promotion report" className="mt-2">
                <div className="flex flex-col gap-2 text-body text-fg-muted">
                  <p>{m.promotion.summary}</p>
                  {m.promotion.failures.length ? (
                    <ul className="list-disc pl-5">
                      {m.promotion.failures.map((f) => (
                        <li key={f} className="font-mono text-code">
                          {f}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p>{m.promotion.meaning}</p>
                </div>
              </Disclosure>
            </>
          ) : (
            <span className="text-fg-muted">n/a: the engine did not report promotion checks.</span>
          )}
        </Fact>
        <Fact label="Drivers">
          {m.drivers.length ? (
            <>
              {plural(m.drivers.length, "input")} reported, {formatNumber(significant, "count")} significant after multiplicity control.
            </>
          ) : (
            <span className="text-fg-muted">None reported.</span>
          )}
        </Fact>
      </dl>
    </Section>
  );
}

export function BatchSection({ pkg }: { pkg: DataPackage }) {
  const props = pkg.proposals;
  const exploit = props.filter((p) => p.mode === "exploit").length;
  const explore = props.filter((p) => p.mode === "explore").length;
  const unit = pkg.objective.target ? parseUnit(pkg.objective.target) : "";
  return (
    <Section
      id="batch"
      title="Latest proposed batch"
      description={
        props.length
          ? `${plural(props.length, "recipe")}: ${formatNumber(exploit, "count")} exploit, ${formatNumber(explore, "count")} explore. Predictions only; none of these has been measured.`
          : "The current analysis has no proposed batch."
      }
    >
      {props.length ? (
        <ol className="flex flex-col">
          {props.map((p) => (
            <li key={p.index} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border py-2.5">
              <span className="w-6 text-label text-fg-muted tabular-nums">{p.index}</span>
              {p.mode === "exploit" || p.mode === "explore" ? <ModeBadge mode={p.mode} /> : <span className="text-caption text-fg-muted">n/a</span>}
              <PredictedValue value={formatNumber(p.predicted.value)} unit={unit || undefined} />
              <span className="text-caption text-fg-muted tabular-nums">
                {p.predicted.band_half_width != null ? formatBand(p.predicted.band_half_width, p.predicted.band_coverage) : `sd ${formatNumber(p.predicted.sd)}`}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </Section>
  );
}
