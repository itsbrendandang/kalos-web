import type { ReactNode } from "react";
import { promotionLine } from "@/components/campaign/learn";
import { targetName } from "@/components/campaign/target";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { Verdict } from "@/components/kit/verdict";
import { ModeBadge } from "@/components/ui/badge";
import { BasisGlyph, Num, NumState, SourceButton } from "@/components/viz/num";
import { calibrationNote, type Promotion } from "@/lib/api";
import { columnDecimals, conformalInterval, coverageText, formatCorr, formatValue, parseUnit } from "@/lib/num";
import type { DataPackage } from "@/lib/report-package";
import type { Source } from "@/lib/source";

const count = (n: number | null | undefined) => formatValue(n, { quantity: "count" }).text;
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

/** The source of a package value: the analysis this package was built from. */
function packageSource(pkg: DataPackage, field: string, basis: Source["basis"], method?: string): Source {
  const p = pkg.provenance;
  const s: Source = { label: pkg.data.dataset ? `Analysis of ${pkg.data.dataset}` : "Engine analysis", field, basis };
  if (pkg.data.dataset) s.dataset = pkg.data.dataset;
  if (p.input_sha256) s.inputSha256 = p.input_sha256;
  if (p.engine_version) s.engineVersion = p.engine_version;
  if (p.build_sha) s.buildSha = p.build_sha;
  if (p.seed != null) s.seed = p.seed;
  if (p.analysis_timestamp != null) s.timestamp = p.analysis_timestamp;
  if (method) s.method = method;
  return s;
}

/** "90% held-out band, half-width 0.204": the engine's band in words (± only in this method line). */
function bandText(halfWidth: number | null, coverage: number | null): string | null {
  if (halfWidth == null) return null;
  const pct = coverageText(coverage);
  return `${pct ? `${pct} held-out band` : "held-out band"}, half-width ${formatValue(halfWidth).text}`;
}

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
  const unit = pkg.objective.target ? parseUnit(pkg.objective.target).unit : null;
  const label = pkg.objective.target ? targetName(pkg.objective.target) : "the target";
  const histDec = columnDecimals(pkg.history.filter((h) => h.best_measured != null).map((h) => ({ value: h.best_measured!, u: null })));
  const best = formatValue(e.best_measured, { unit, basis: "measured" });
  return (
    <Section id="evidence" title="Evidence" description="Measured values only. Nothing in this section is a prediction.">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-label text-fg-muted">
          <BasisGlyph basis="measured" />
          Best measured {label} so far
          {e.best_measured != null ? <SourceButton source={{ label: "Campaign summary", field: "campaign.best", basis: "measured" }} full={best.full} /> : null}
        </p>
        {e.best_measured != null ? <Num value={e.best_measured} basis="measured" unit={unit} size="metric" glyph={false} /> : <NumState state={{ kind: "na", reason: "no measured best yet" }} className="text-title" />}
        <p className="text-body text-fg-muted">
          From {e.n_base_rows != null ? plural(e.n_base_rows, "measured row") : "n/a measured rows"} in the model&apos;s base data. Campaign runs:{" "}
          {count(e.n_measured_runs)} measured, {count(e.n_awaiting_runs)} awaiting a result.
        </p>
      </div>
      {pkg.history.length > 1 ? (
        <dl>
          {pkg.history.map((h) => (
            <Fact key={h.round} label={h.round === 0 ? "Uploaded sheet" : `After round ${h.round}`}>
              <span className="font-semibold tabular-nums">{formatValue(h.best_measured, { decimals: histDec, unit, basis: "measured" }).text}</span>
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
              Trust floor: <span className="tabular-nums">{formatValue(rel.engine?.spearman_floor, { quantity: "corr" }).text}</span>
            </div>
            <div>Clears floor: {rel.engine ? (rel.engine.clears_floor ? "yes" : "no") : "n/a"}</div>
            <div>CI excludes zero: {rel.engine ? (rel.engine.ci_excludes_zero ? "yes" : "no") : "n/a"}</div>
          </dl>
        }
      >
        {rel.label}. <span className="text-body text-fg-muted">{rel.reason}</span>
      </Verdict>
      <dl>
        <Fact label="Held-out rank agreement">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <BasisGlyph basis="derived" />
            {formatCorr(m.cv_spearman, m.cv_ci95).text}
            {m.cv_spearman != null ? <SourceButton source={packageSource(pkg, "cv_spearman, cv_ci95", "derived", "grouped cross-validation")} full={String(m.cv_spearman)} /> : null}
          </span>
          {m.cv_spearman != null && !m.cv_ci95 ? <span className="text-fg-muted">, no interval reported</span> : null}
        </Fact>
        <Fact label="Prediction band">
          <span className="tabular-nums">{bandText(m.conformal.half_width, m.conformal.coverage) ?? "n/a"}</span>
          <span className="text-fg-muted">{m.conformal.half_width != null ? " around each predicted value, from held-out errors." : ": the engine reported no held-out band, so predictions carry no interval."}</span>
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
              {plural(m.drivers.length, "input")} reported, {count(significant)} significant after multiplicity control.
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
  const unit = pkg.objective.target ? parseUnit(pkg.objective.target).unit : null;
  return (
    <Section
      id="batch"
      title="Latest proposed batch"
      description={
        props.length
          ? `${plural(props.length, "recipe")}: ${count(exploit)} exploit, ${count(explore)} explore. Predictions only; none of these has been measured.`
          : "The current analysis has no proposed batch."
      }
    >
      {props.length ? (
        <ol className="flex flex-col">
          {props.map((p) => (
            <li key={p.index} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border py-2.5">
              <span className="w-6 text-label text-fg-muted tabular-nums">{p.index}</span>
              {p.mode === "exploit" || p.mode === "explore" ? <ModeBadge mode={p.mode} /> : <span className="text-caption text-fg-muted">n/a</span>}
              <Num
                value={p.predicted.value}
                basis="predicted"
                unit={unit}
                interval={conformalInterval(p.predicted.value, p.predicted.band_half_width, p.predicted.band_coverage)}
              />
              {p.predicted.band_half_width == null ? (
                <span className="text-caption text-fg-muted tabular-nums">
                  interval n/a; model SD {formatValue(p.predicted.sd).text} (not a held-out band)
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </Section>
  );
}
