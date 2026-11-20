"use client";

import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { Panel } from "@/components/kit/section";
import { TONE_ICON, TONE_TEXT, type Tone } from "@/components/kit/tone";
import { alternativeScaleNote, noiseFacts, promotionView, trustTone, type PredictAnalysis } from "@/components/predict/predict-view";
import { CalibrationPlot } from "@/components/viz/charts/calibration-plot";
import { ParityPlot } from "@/components/viz/charts/parity-plot";
import { ReliabilityScorecard } from "@/components/viz/charts/reliability-scorecard";
import { BasisGlyph, SourceButton } from "@/components/viz/num";
import { targetName as targetNameOf } from "@/components/campaign/target";
import { CV_GROUPING_NOTE, cvGroupingText, targetUnitOf } from "@/lib/api";
import { formatCorr, formatValue } from "@/lib/num";
import { sourceFromAnalysis } from "@/lib/source";
import { cn } from "@/lib/utils";
import { toCalibration } from "@/lib/viz-data/calibration-plot";
import { toParity } from "@/lib/viz-data/parity-plot";
import { toScorecard, type Gate, type PromotionChecklist } from "@/lib/viz-data/reliability-scorecard";

/**
 * "Can the model be trusted?": the evidence before the batch. The verdict
 * sentence comes first (the engine's reliability verdict and its floor), then
 * the scorecard (C8: held-out rank agreement with its CI and repeats, the
 * baselines, the trust floor, top-k) and the promotion checklist (reported,
 * not enforced), then the parity plot (C6: held-out predictions against the
 * conformal band) beside the calibration diagram (C7: does the model's own
 * uncertainty mean what it says). Every mark and number is an engine field.
 * The group-mean baseline becomes the page's callout when the model does not
 * beat it, unless the page already shows one (`calloutTaken`).
 */
export function TrustPanel({ d, calloutTaken = false, stale = null }: { d: PredictAnalysis; calloutTaken?: boolean; stale?: { nNew: number } | null }) {
  const sc = toScorecard(d);
  const parity = toParity(d);
  const cal = toCalibration(d);
  const verdict = sc.verdict;
  const tone = trustTone(verdict.state);
  const rel = d.reliability;
  const promotion = promotionView(d.promotion);
  const unmodeled = (rel?.unmodeled ?? []).filter(Boolean);
  const advice = rel?.space_filling_advice ?? null;
  const targetName = targetNameOf(d.target);
  const unit = targetUnitOf(d);
  const relSource = sourceFromAnalysis(d, "reliability.spearman, cv_ci95, reliability.spearman_floor", "derived", "grouped cross-validation, Spearman ρ");
  const rho = formatCorr(verdict.rho, verdict.ci);
  const count = (n: number) => formatValue(n, { quantity: "count" }).text;
  // Which grouping drove the held-out score (F05): "held-out by batch (5 groups)" replaces the bare group count.
  const grouping = cvGroupingText(d.cv_grouping);
  const evidence = [
    sc.evidence.n != null ? `${count(sc.evidence.n)} rows` : null,
    grouping ? null : sc.evidence.groups != null ? `${count(sc.evidence.groups)} CV groups` : null,
    sc.evidence.repeats != null ? `${count(sc.evidence.repeats)} ${sc.evidence.repeats === 1 ? "repeat" : "repeats"}` : null,
  ].filter(Boolean);
  const showCallout = sc.baseline?.prominent && !calloutTaken;

  return (
    <section aria-labelledby="predict-trust-title" className="flex flex-col gap-4">
      <h2 id="predict-trust-title" className="text-heading text-fg">
        Can the model be trusted?
      </h2>
      <Panel className="flex flex-col gap-6">
        <div className="flex items-start gap-2.5">
          <ToneIcon tone={tone} className="mt-1" />
          <div className="min-w-0">
            <p className="text-heading text-fg">{verdict.label}</p>
            <p className="mt-0.5 max-w-[72ch] text-body text-fg-muted">{verdict.reason}</p>
            {verdict.rho != null ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-fg-muted tabular-nums">
                <span className="inline-flex items-baseline gap-1.5">
                  <BasisGlyph basis="derived" className="self-center" />
                  <span className="text-title font-medium text-fg">ρ {rho.value}</span>
                  {rho.interval ? (
                    <span className="text-caption">
                      {rho.interval} {rho.coverage} CI
                    </span>
                  ) : (
                    <span className="text-caption">no interval reported</span>
                  )}
                </span>
                {grouping ? (
                  <span className="text-fg" title={CV_GROUPING_NOTE}>
                    {grouping}
                  </span>
                ) : null}
                <span>
                  {verdict.state === "not-judged"
                    ? verdict.floor != null
                      ? `trust floor ${formatCorr(verdict.floor).value} not judged`
                      : "trust floor not judged"
                    : verdict.floor != null
                      ? `trust floor ${formatCorr(verdict.floor).value}`
                      : "no trust floor reported"}
                </span>
                {evidence.length ? <span>{evidence.join(", ")}</span> : null}
                <SourceButton source={relSource} full={verdict.rho != null ? String(verdict.rho) : undefined} />
              </p>
            ) : null}
          </div>
        </div>

        {showCallout ? (
          <Callout tone="warn" title="The model does not beat the group-mean baseline">
            {sc.baseline!.text}. Its ranking may come from recognizing replicated recipes rather than modeling the process. More distinct recipes, not more replicates, would show whether it does better.
          </Callout>
        ) : null}

        <ReliabilityScorecard data={sc} source={relSource} stale={stale} />

        <PromotionGates checklist={sc.promotion} />

        <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t border-border pt-5 @3xl:grid-cols-2">
          <ParityPlot
            data={parity}
            perProposal={Array.isArray(d.interval_levels) && d.interval_levels.length > 0}
            target={targetName}
            unit={unit}
            stale={stale}
            source={sourceFromAnalysis(d, "oof, conformal_q, conformal_coverage", "derived", "held-out conformal band from pooled out-of-fold residuals")}
          />
          <CalibrationPlot data={cal} stale={stale} source={sourceFromAnalysis(d, "reliability.calibration", "derived", "held-out coverage of the model's uncertainty bands")} />
        </div>

        {unmodeled.length || advice ? (
          <ul className="flex flex-col gap-1.5 border-t border-border pt-4">
            {unmodeled.length ? (
              <Line tone="neutral">
                <span className="text-fg">Not modeled:</span> {unmodeled.join(", ")}.
              </Line>
            ) : null}
            {advice ? <Line tone="neutral">{advice}</Line> : null}
          </ul>
        ) : null}

        <Disclosure summary="More checks on the model" meta="method details">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-body sm:grid-cols-[max-content_minmax(0,1fr)]">
            <Row label="Group-mean baseline" value={sc.baseline ? sc.baseline.text : undefined} warn={sc.baseline?.prominent} />
            <Row label="Alternative scale" value={alternativeScaleNote(d.alternative_scale)} />
            {promotion?.metrics.length ? <Row label="Promotion metrics" value={promotion.metrics.map((m) => `${m.label} ${m.value}`).join("; ") + "."} /> : null}
            {d.promotion?.summary ? <Row label="Promotion summary (engine)" value={d.promotion.summary} /> : null}
          </dl>
          {d.noise ? (
            <div className="mt-4">
              <h3 className="text-label text-fg">Replicate noise</h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                {noiseFacts(d.noise).map((f) => (
                  <div key={f.label} className="min-w-0">
                    <dt className="text-caption text-fg-muted">{f.label}</dt>
                    <dd className="text-body text-fg tabular-nums">{f.value}</dd>
                    {f.caption ? <dd className="text-caption text-fg-muted">{f.caption}</dd> : null}
                  </div>
                ))}
              </dl>
              {d.noise.scale?.reason ? <p className="mt-2 text-caption text-fg-muted">Noise scale: {d.noise.scale.reason}.</p> : null}
            </div>
          ) : null}
        </Disclosure>
      </Panel>
    </section>
  );
}

const GATE_PREFIX: Record<Gate["status"], string> = {
  passed: "Passed",
  missed: "Measured and below its gate",
  unmeasured: "Not measurable on this data",
  "not-judged": "Not judged",
};

/** The promotion verdict as a checklist: passed and missed gates are measured; unmeasured and not-judged ones are neutral. */
function PromotionGates({ checklist }: { checklist: PromotionChecklist | null }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-label text-fg-muted">Promotion gates</span>
        <span className="text-heading text-fg">{checklist ? (checklist.passed ? "Passed" : "Not passed") : "Not reported"}</span>
        {checklist ? (
          <span className="text-caption text-fg-muted tabular-nums">
            {checklist.judged ? `${checklist.nPassed} of ${checklist.judged} gates passed. ` : ""}Reported, not enforced: it does not block proposals.
          </span>
        ) : null}
      </div>
      {/* The engine's `meaning` explains what passed=false does (and does not) mean; it only applies when the gates did not pass. */}
      {checklist?.meaning && !checklist.passed ? <p className="max-w-[72ch] text-caption text-fg-muted">{checklist.meaning}</p> : null}
      {checklist && checklist.gates.length ? (
        <ul className="flex flex-col gap-1">
          {checklist.gates.map((g) => (
            <li key={g.key} className="flex items-start gap-2 text-body text-fg-muted">
              <GateIcon status={g.status} />
              <span className="min-w-0 break-words">
                <span className="text-fg">{GATE_PREFIX[g.status]}: </span>
                {g.label}
                {g.value != null ? <span className="tabular-nums text-fg"> {formatValue(g.value, { quantity: "score" }).value}</span> : null}
                {g.engine && g.status !== "passed" ? <span className="block text-caption">{g.status === "not-judged" ? g.engine : `Engine: ${g.engine}`}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {!checklist ? <p className="text-caption text-fg-muted">This engine build did not report a promotion verdict.</p> : null}
    </div>
  );
}

function GateIcon({ status }: { status: Gate["status"] }) {
  const cls = "mt-1 size-4 shrink-0";
  if (status === "passed") return <CircleCheck className={cn(cls, "text-good")} aria-label="passed" />;
  if (status === "missed") return <CircleAlert className={cn(cls, "text-bad")} aria-label="missed" />;
  return <CircleDashed className={cn(cls, "text-fg-muted")} aria-label="not scored" />;
}

function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  const Icon = TONE_ICON[tone];
  return <Icon className={cn("size-4 shrink-0", TONE_TEXT[tone], className)} aria-hidden />;
}

function Line({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-body text-fg-muted">
      <ToneIcon tone={tone} className="mt-1" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

/** One method check. `undefined` hides the row (the field is not part of this engine's answer); `null` reads "Not reported". */
function Row({ label, value, warn = false }: { label: string; value: string | null | undefined; warn?: boolean }) {
  if (value === undefined) return null;
  return (
    <div className="contents">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">
        {warn ? <ToneIcon tone="warn" className="mr-1.5 inline-block align-[-2px]" /> : null}
        {value ?? <span className="text-fg-muted">Not reported by this engine build</span>}
      </dd>
    </div>
  );
}
