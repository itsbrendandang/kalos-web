"use client";

import type { ReactNode } from "react";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { Panel } from "@/components/kit/section";
import { TONE_ICON, TONE_TEXT, type Tone } from "@/components/kit/tone";
import {
  alternativeScaleNote,
  calibrationHeadline,
  evidenceFact,
  noiseFacts,
  promotionView,
  rankAgreementFact,
  trustTone,
  type Fact,
  type PredictAnalysis,
} from "@/components/predict/predict-view";
import {
  calibrationNote,
  coveragePct,
  cvLogoNote,
  cvTopKNote,
  groupMeanBaselineVerdict,
  reliabilityVerdict,
  repeatSpreadNote,
} from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Can the model be trusted?": the evidence before the batch. Every line is
 * an engine field: the reliability verdict and its floor, the held-out rank
 * agreement with its interval, how much evidence it rests on, the interval
 * calibration, the conformal band with its real coverage, and the promotion
 * verdict (reported, not enforced). Method checks sit in a disclosure; the
 * group-mean baseline becomes the page's callout when the model does not
 * beat it, unless the page already shows one (`calloutTaken`).
 */
export function TrustPanel({ d, calloutTaken = false }: { d: PredictAnalysis; calloutTaken?: boolean }) {
  const verdict = reliabilityVerdict(d);
  const tone = trustTone(verdict.state);
  const rel = d.reliability;
  const cal = rel?.calibration;
  const coverage = coveragePct(d.conformal_coverage);
  const promotion = promotionView(d.promotion);
  const baseline = groupMeanBaselineVerdict(d.cv_spearman, d.cv_group_mean_baseline);
  const unmodeled = (rel?.unmodeled ?? []).filter(Boolean);
  const advice = rel?.space_filling_advice ?? null;

  const facts: (Fact & { extra?: ReactNode })[] = [
    rankAgreementFact(verdict, repeatSpreadNote(d.cv_n_repeats, d.cv_spearman_per_repeat)),
    evidenceFact(d),
    {
      label: "Prediction band",
      value: d.conformal_q != null ? `± ${formatNumber(d.conformal_q)}` : "Not reported",
      caption: d.conformal_q != null ? `${coverage ? `${coverage} coverage` : "Coverage not reported"}, measured on held-out runs; not guaranteed for new proposals. Same width for every proposal.` : "The engine reported no band, so predictions carry no interval.",
    },
    {
      label: "Interval calibration",
      value: calibrationHeadline(cal),
      caption: cal ? `The model's own uncertainty on held-out runs: ${calibrationNote(cal)}` : "The engine did not score how honest the model's own uncertainty is.",
    },
  ];

  return (
    <section aria-labelledby="predict-trust-title" className="flex flex-col gap-4">
      <h2 id="predict-trust-title" className="text-heading text-fg">
        Can the model be trusted?
      </h2>
      <Panel className="flex flex-col gap-5">
        <div className="flex items-start gap-2.5">
          <ToneIcon tone={tone} className="mt-1" />
          <div className="min-w-0">
            <p className="text-heading text-fg">{verdict.label}</p>
            <p className="mt-0.5 max-w-[72ch] text-body text-fg-muted">{verdict.reason}</p>
          </div>
        </div>

        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-label text-fg-muted">{f.label}</dt>
              <dd className="text-heading text-fg tabular-nums">{f.value}</dd>
              {f.caption ? <dd className="text-caption text-fg-muted">{f.caption}</dd> : null}
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-label text-fg-muted">Promotion gates</span>
            <span className="text-heading text-fg">{promotion ? promotion.headline : "Not reported"}</span>
            {promotion ? <span className="text-caption text-fg-muted">Reported, not enforced: it does not block proposals.</span> : null}
          </div>
          {promotion?.meaning ? <p className="max-w-[72ch] text-caption text-fg-muted">{promotion.meaning}</p> : null}
          {promotion && (promotion.missed.length || promotion.unmeasured.length || promotion.notJudged.length) ? (
            <ul className="flex flex-col gap-1">
              {promotion.missed.map((f) => (
                <Line key={f} tone="warn" label="Measured and below its gate">
                  <span className="font-mono text-code">{f}</span>
                </Line>
              ))}
              {promotion.unmeasured.map((f) => (
                <Line key={f} tone="neutral" label="Not measurable on this data">
                  <span className="font-mono text-code">{f}</span>
                </Line>
              ))}
              {promotion.notJudged.map((f) => (
                <Line key={f} tone="neutral" label="Not judged">
                  {f}
                </Line>
              ))}
            </ul>
          ) : null}
          {!promotion ? <p className="text-caption text-fg-muted">This engine build did not report a promotion verdict.</p> : null}
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

        {baseline?.prominent && !calloutTaken ? (
          <Callout tone="warn" title="The model does not beat the group-mean baseline">
            {baseline.text}. Its ranking may come from recognizing replicated recipes rather than modeling the process. More distinct recipes, not more replicates, would show whether it does better.
          </Callout>
        ) : null}

        <Disclosure summary="More checks on the model" meta="method details">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-body sm:grid-cols-[max-content_minmax(0,1fr)]">
            <Row label="Leave-one-group-out" value={cvLogoNote(d.cv_logo)} />
            <Row label="Top-k overlap" value={cvTopKNote(d.cv_topk)} />
            <Row label="Group-mean baseline" value={baseline ? baseline.text : null} warn={baseline?.prominent} />
            <Row label="Producers only" value={rel?.producer_spearman != null ? `ρ ${formatNumber(rel.producer_spearman, "corr")} over ${formatNumber(rel.n_producers, "count")} runs above ${formatNumber(rel.producer_threshold)}${rel.producer_clears_floor ? ", clears the floor" : ", below the floor"}.` : undefined} />
            <Row label="Alternative scale" value={alternativeScaleNote(d.alternative_scale)} />
            {cal?.levels?.length ? (
              <Row
                label="Calibration by level"
                value={cal.levels.map((l) => `${formatNumber(l.nominal, "pct")} nominal: ${formatNumber(l.empirical, "pct")} held-out`).join("; ") + "."}
              />
            ) : null}
            {promotion?.metrics.length ? <Row label="Promotion metrics" value={promotion.metrics.map((m) => `${m.label} ${m.value}`).join("; ") + "."} /> : null}
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

function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  const Icon = TONE_ICON[tone];
  return <Icon className={cn("size-4 shrink-0", TONE_TEXT[tone], className)} aria-hidden />;
}

function Line({ tone, label, children }: { tone: Tone; label?: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-body text-fg-muted">
      <ToneIcon tone={tone} className="mt-1" />
      <span className="min-w-0 break-words">
        {label ? <span className="text-fg">{label}: </span> : null}
        {children}
      </span>
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
