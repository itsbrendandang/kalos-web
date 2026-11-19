import type { ReactNode } from "react";
import { promotionLine } from "@/components/campaign/learn";
import { targetName } from "@/components/campaign/target";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { Verdict } from "@/components/kit/verdict";
import { ModeBadge } from "@/components/ui/badge";
import { BasisGlyph, Num, NumState, SourceButton } from "@/components/viz/num";
import { CV_GROUPING_NOTE, NOT_JUDGED_LABEL, calibrationNote, floorNotJudged, intervalAt, type Promotion } from "@/lib/api";
import { columnDecimals, conformalInterval, coverageText, formatCorr, formatSetting, formatValue, type IntervalSpec } from "@/lib/num";
import type { DataPackage, PackageIntervalCaveat } from "@/lib/report-package";
import { basisText } from "@/lib/proposal-caveat";
import { EXPLORATION_LABEL, modelRefusalOf } from "@/lib/proposal-trust";
import { cn } from "@/lib/utils";
import { typedValue } from "@/components/report/report-copy";
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

const UNIT_SOURCE: Record<string, string> = {
  user: "set in the campaign setup",
  header: "read from the column header",
  none: "none stated in the column header",
};

export function ObjectiveSection({ pkg }: { pkg: DataPackage }) {
  const o = pkg.objective;
  const target = o.target;
  const applied = o.setup.applied;
  const stored = o.setup.stored && !("status" in o.setup.stored) ? o.setup.stored : null;
  const bounds = Object.entries(applied?.bounds_applied ?? {});
  const constraints = applied?.constraints_applied ?? [];
  const verb = o.direction === "minimize" ? "Minimize" : "Maximize";
  return (
    <Section id="objective" title="Objective">
      <dl>
        <Fact label="Goal">
          {target ? (
            <>
              {verb} <span className="font-mono text-code">{target}</span>.{" "}
              <span className="text-fg-muted">
                {o.direction_source === "engine_default"
                  ? "No goal was set in the campaign setup, so the engine maximizes (its default)."
                  : o.direction_source === "analysis"
                    ? "As set in the campaign setup and applied to this analysis."
                    : "As the campaign summary reports."}
              </span>
            </>
          ) : (
            "No target has been chosen yet."
          )}
        </Fact>
        <Fact label="Target unit">
          {o.unit ? <span>{o.unit}</span> : <span className="text-fg-muted">n/a</span>}
          {o.target_unit ? <span className="text-fg-muted"> ({UNIT_SOURCE[o.target_unit.source] ?? o.target_unit.source}). A display label only; values are never converted.</span> : null}
        </Fact>
        <Fact label="Search box">
          The engine searches inside the observed range of each input in the data{bounds.length ? ", narrowed by the bounds below" : ""}. It never widens the
          search beyond the data, and the search box is not an operating range.
          {bounds.length ? (
            <ul className="mt-2 flex flex-col gap-1">
              {bounds.map(([k, b]) => (
                <li key={k} className="tabular-nums">
                  <span className="font-mono text-code">{k}</span> applied{" "}
                  {b.applied ? `${formatSetting(b.applied[0], b.applied).text} to ${formatSetting(b.applied[1], b.applied).text}` : "n/a"}
                  {b.extrapolates ? <span className="text-fg-muted"> (the requested bound reached past the data, so it was cut to the observed range)</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Fact>
        {constraints.length ? (
          <Fact label="Linear constraints">
            <ul className="flex flex-col gap-1 tabular-nums">
              {constraints.map((c, i) => (
                <li key={i}>
                  {Object.entries(c.coefficients)
                    .map(([k, v]) => `${typedValue(v)}·${k}`)
                    .join(" + ")}{" "}
                  {c.op === "<=" ? "≤" : "≥"} {typedValue(c.rhs)}
                </li>
              ))}
            </ul>
          </Fact>
        ) : null}
        {applied?.status === "refused" ? (
          <Fact label="Setup">
            The engine could not honour the campaign setup, so this analysis proposed no batch
            {applied.refusal?.reason || applied.refusal?.message ? <>: {applied.refusal.reason ?? applied.refusal.message}</> : "."}
          </Fact>
        ) : null}
        {stored?.settings_in_sync === false ? (
          <Fact label="Setup changes">The campaign setup changed after this analysis. Re-analyze on Validate to apply it; the analysis above uses the earlier setup.</Fact>
        ) : null}
      </dl>
    </Section>
  );
}

export function EvidenceSection({ pkg }: { pkg: DataPackage }) {
  const e = pkg.evidence;
  const unit = pkg.objective.unit;
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
            <div>
              Clears floor:{" "}
              {rel.engine ? (floorNotJudged(rel.engine) ? `${NOT_JUDGED_LABEL.toLowerCase()}${rel.engine.not_judged_reason ? ` (${rel.engine.not_judged_reason})` : ""}` : rel.engine.clears_floor ? "yes" : "no") : "n/a"}
            </div>
            {m.verdict?.state ? <div>Engine verdict: {m.verdict.state.replace(/_/g, " ")}{m.verdict.headline ? `: ${m.verdict.headline}` : ""}</div> : null}
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
          {m.cv_grouping.text ? <span className="text-fg-muted" title={CV_GROUPING_NOTE}>, {m.cv_grouping.text}</span> : null}
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

/**
 * The interval a proposal shows: its own per-proposal interval at the
 * engine's first level (labelled with that entry's coverage), that level's
 * refusal reason, or, for analyses that predate per-proposal intervals, the
 * global held-out band.
 */
export function proposalInterval(
  p: DataPackage["proposals"][number],
  levels: number[],
): { interval: IntervalSpec | null; refused: string | null; caveat: PackageIntervalCaveat | null } {
  const level = levels[0] ?? p.predicted.intervals[0]?.coverage;
  const entry = level != null ? intervalAt(p.predicted.intervals, level) : null;
  const caveats = p.predicted.interval_caveats ?? [];
  if (entry) {
    if (entry.available && entry.lo != null && entry.hi != null) {
      const caveat = caveats.find((c) => c.applies_to === "per_proposal_interval" && c.coverage === entry.coverage) ?? null;
      return { interval: { lo: entry.lo, hi: entry.hi, coverage: entry.coverage, method: "conformal" }, refused: null, caveat };
    }
    return { interval: null, refused: entry.reason ?? "the engine refused this interval level", caveat: null };
  }
  const interval = conformalInterval(p.predicted.value, p.predicted.band_half_width, p.predicted.band_coverage);
  return { interval, refused: null, caveat: interval ? (caveats.find((c) => c.applies_to === "global_band") ?? null) : null };
}

export function BatchSection({ pkg }: { pkg: DataPackage }) {
  const props = pkg.proposals;
  const exploit = props.filter((p) => p.mode === "exploit").length;
  const explore = props.filter((p) => p.mode === "explore").length;
  const unit = pkg.objective.unit;
  const levels = pkg.model.interval_levels;
  // Why there is no batch, in the engine's words (refusal, proposal_trust.withheld or verdict refused), as on Predict.
  const withheld = props.length ? null : modelRefusalOf({ refusal: pkg.model.refusal, proposal_trust: pkg.model.proposal_trust, verdict: pkg.model.verdict });
  return (
    <Section
      id="batch"
      title="Latest proposed batch"
      description={
        props.length
          ? `${plural(props.length, "recipe")}: ${count(exploit)} exploit, ${count(explore)} explore. Predictions only; none of these has been measured.${
              levels.length > 1 ? ` The package also holds each recipe's interval at the other levels the engine computed (${levels.map((l) => coverageText(l)).join(", ")}).` : ""
            }`
          : withheld
            ? "The engine withheld the batch because the model cannot be checked or trusted yet."
            : "The current analysis has no proposed batch."
      }
    >
      {props.length ? (
        <>
          <ol className="flex flex-col">
            {props.map((p) => {
              const { interval, refused } = proposalInterval(p, levels);
              return (
                <li key={p.index} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border py-2.5">
                  <span className="w-6 text-label text-fg-muted tabular-nums">{p.index}</span>
                  {p.mode === "exploit" || p.mode === "explore" ? <ModeBadge mode={p.mode} /> : <span className="text-caption text-fg-muted">n/a</span>}
                  <Num value={p.predicted.value} basis="predicted" unit={unit} interval={interval} />
                  {p.trust ? (
                    <span className={cn("text-caption", p.trust.label === EXPLORATION_LABEL ? "text-warn" : "text-fg-muted")}>{p.trust.label}</span>
                  ) : null}
                  {interval == null ? (
                    <span className="text-caption text-fg-muted tabular-nums">
                      interval n/a{refused ? ` (${refused})` : ""}; model SD {formatValue(p.predicted.sd).text} (not a held-out band)
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {(() => {
            // Every interval above travels with its trust caveat; each distinct caveat is shown once.
            const shown = [...new Map(props.map((p) => proposalInterval(p, levels).caveat).filter((c): c is PackageIntervalCaveat => c != null).map((c) => [c.text, c])).values()];
            return shown.map((c) => (
              <p key={c.text} role="note" className="text-caption text-fg-muted">
                {c.text}
                {c.interval_basis ? ` Interval basis: ${basisText(c.interval_basis)}.` : ""}
              </p>
            ));
          })()}
        </>
      ) : withheld ? (
        <div className="flex flex-col gap-1 text-body">
          {withheld.reasons.map((r) => (
            <p key={r} className="text-fg">
              {r}
            </p>
          ))}
          {withheld.fix ? <p className="text-fg-muted">What would help: {withheld.fix}</p> : null}
          {withheld.code ? (
            <p className="text-caption text-fg-muted">
              Engine code <span className="font-mono text-code">{withheld.code}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}
