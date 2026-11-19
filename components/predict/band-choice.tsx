"use client";

import Link from "next/link";
import { Disclosure } from "@/components/kit/disclosure";
import { RefusalBlock } from "@/components/viz/refusal";
import { buttonVariants } from "@/components/ui/button";
import type { SetupRefusalView } from "@/components/predict/predict-view";
import { coverageText, formatValue } from "@/lib/num";
import { campaignHref } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { PER_PROPOSAL_METHOD, type IntervalMode, type LevelInfo } from "@/lib/viz-data/batch-interval-strip";

const count = (n: number) => formatValue(n, { quantity: "count" }).text;
const pct = (v: number) => formatValue(v, { quantity: "pct" }).text;

/** "low-sigma half" for the engine's coverage_by_sigma_half keys. */
const halfName = (key: string) => (key === "low_sigma" ? "recipes the model is surer about" : key === "high_sigma" ? "recipes the model is less sure about" : key.replace(/_/g, " "));

/**
 * The coverage choice for the per-proposal bands (engine `interval_levels`):
 * a segmented radio group, labels from the engine's own numbers, the first
 * level by default. A level the engine refused is still selectable; choosing
 * it shows the engine's reason and what would fix it, and no band is drawn
 * (there is no silent fallback to the model's GP band). Older analyses
 * without per-proposal intervals render nothing here.
 */
export function BandChoice({ mode, onChange }: { mode: IntervalMode; onChange: (coverage: number) => void }) {
  if (mode.kind !== "per-proposal") return null;
  const refused = mode.level && !mode.level.available ? mode.level : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {mode.levels.length > 1 ? (
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="sr-only">Band coverage</legend>
            <span className="text-label text-fg" aria-hidden>
              Band coverage
            </span>
            <span className="inline-flex rounded-lg border border-border-strong bg-surface p-0.5">
              {mode.levels.map((l) => {
                const on = l.coverage === mode.coverage;
                const text = coverageText(l.coverage) ?? "";
                return (
                  <label
                    key={l.coverage}
                    className={cn(
                      "inline-flex h-7 cursor-pointer items-center rounded-md px-3 text-label tabular-nums transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]",
                      on ? "bg-accent-soft text-accent" : "text-fg hover:bg-subtle",
                    )}
                  >
                    <input type="radio" name="band-coverage" className="sr-only" value={l.coverage} checked={on} onChange={() => onChange(l.coverage)} />
                    {text}
                    {!l.available ? <span className="ml-1 text-caption text-fg-muted">refused</span> : null}
                  </label>
                );
              })}
            </span>
          </fieldset>
        ) : (
          <span className="text-label text-fg">Band coverage {coverageText(mode.coverage)}</span>
        )}
        <span className="text-caption text-fg-muted">Each proposal&apos;s own band: {PER_PROPOSAL_METHOD}.</span>
      </div>
      {refused ? <LevelRefusal level={refused} /> : null}
      <Disclosure summary="How the per-recipe band is built" meta="method details">
        <BandMethod mode={mode} />
      </Disclosure>
    </div>
  );
}

function LevelRefusal({ level }: { level: LevelInfo }) {
  return (
    <RefusalBlock
      title={`No ${coverageText(level.coverage)} band: the engine refused this coverage`}
      reasons={[level.reason ?? "The engine did not issue a band at this coverage."]}
      fix={level.fix ? [level.fix] : undefined}
      footer={
        <>
          No band is drawn at this coverage. The model&apos;s GP band is not a substitute: it appears only in each proposal&apos;s details, labelled model-based.
          {level.code ? <span className="font-mono text-code"> ({level.code})</span> : null}
        </>
      }
    />
  );
}

function BandMethod({ mode }: { mode: Extract<IntervalMode, { kind: "per-proposal" }> }) {
  return (
    <div className="flex flex-col gap-3 text-body">
      <p className="text-fg">
        The engine scores how far each held-out run landed from the model&apos;s out-of-fold prediction, in units of the model&apos;s own spread, then scales a quantile of those scores by each proposal&apos;s
        predictive spread. A recipe the model is less sure about gets a wider band.
        {mode.nCalibration != null ? ` Calibrated on ${count(mode.nCalibration)} held-out scores.` : ""}
      </p>
      {mode.guarantee ? (
        <p className="text-caption text-fg-muted">
          Coverage guarantee, as the engine states it: <span className="text-fg">{mode.guarantee}</span>
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {mode.levels.map((l) => (
          <li key={l.coverage} className="flex flex-col gap-0.5">
            <span className="text-label text-fg">{coverageText(l.coverage)} band</span>
            {l.available ? (
              <span className="text-caption text-fg-muted tabular-nums">
                {l.empirical != null
                  ? `${pct(l.empirical)} of held-out scores inside${l.nInside != null && l.nCalibration != null ? ` (${count(l.nInside)} of ${count(l.nCalibration)})` : ""}, counted in-sample on the same scores that set the band, so it is not an independent check.`
                  : "In-sample coverage not reported."}
                {l.bySigma.length
                  ? ` Split by the model's own spread: ${l.bySigma
                      .map((b) => `${b.coverage != null ? pct(b.coverage) : "n/a"} on the ${count(b.n)} ${halfName(b.key)}`)
                      .join(", ")}.`
                  : ""}
              </span>
            ) : (
              <span className="text-caption text-fg-muted">
                Refused: {l.reason ?? "no reason given"}
                {l.fix ? ` What would fix it: ${l.fix}` : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
      {mode.empiricalNote ? <p className="text-caption text-fg-muted">Engine note on the in-sample count: {mode.empiricalNote}</p> : null}
      {mode.method ? <p className="text-caption text-fg-muted">Engine method: <span className="font-mono text-code">{mode.method}</span></p> : null}
    </div>
  );
}

/** The setup could not be honoured: the engine's refusal, what would fix it, and where the setup is edited. */
export function SetupRefusal({ refusal, id }: { refusal: SetupRefusalView; id: string }) {
  return (
    <RefusalBlock
      title="No proposals: the campaign setup could not be applied"
      reasons={[refusal.reason]}
      fix={refusal.fix ? [refusal.fix] : undefined}
      footer={
        <span className="flex flex-col items-start gap-2">
          <span>
            Kalos never drops a bound or constraint silently, so it proposed nothing rather than ignore part of the setup.
            {refusal.code ? <span className="font-mono text-code"> ({refusal.code})</span> : null}
          </span>
          <Link href={campaignHref(id, "harmonize")} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Edit the setup on Harmonize
          </Link>
        </span>
      }
    />
  );
}
