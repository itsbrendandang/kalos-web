import { FileDown } from "lucide-react";
import { StepBadge } from "@/components/kit/cycle-stepper";
import { MeasuredMark, PredictedMark } from "@/components/campaign/plan/marks";
import { cn } from "@/lib/utils";

/*
 * How a campaign runs, in Kalos's own words: the repeating Harmonize ->
 * Predict -> Validate cycle, then the Report. Shared by the first-run home
 * and an empty campaign's Overview.
 */

const CYCLE: { n: 1 | 2 | 3; label: string; text: string }[] = [
  {
    n: 1,
    label: "Harmonize",
    text: "Bring the runs you already have. Kalos checks the sheet column by column and maps the range your data has explored.",
  },
  {
    n: 2,
    label: "Predict",
    text: "A Bayesian model proposes the next batch. Every prediction carries its interval, and a held-out check says how far the model can be trusted.",
  },
  {
    n: 3,
    label: "Validate",
    text: "You run the batch in your own lab and record what you measure. The results feed the next round's model.",
  },
];

export function HowItWorks({ className, titled = true }: { className?: string; titled?: boolean }) {
  return (
    <section aria-labelledby={titled ? "how-title" : undefined} aria-label={titled ? undefined : "How a campaign runs"} className={cn("flex flex-col gap-4", className)}>
      <div className={titled ? undefined : "sr-only"}>
        <h2 id="how-title" className="text-heading text-fg">
          How a campaign runs
        </h2>
        <p className="mt-0.5 text-body text-fg-muted">Start a campaign, then repeat the cycle until the results are where you need them.</p>
      </div>
      <ol className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {CYCLE.map((s) => (
          <li key={s.n} className="flex flex-col gap-2 bg-surface p-panel">
            <span className="flex items-center gap-2.5">
              <StepBadge n={s.n} state="upcoming" />
              <span className="text-heading text-fg">{s.label}</span>
            </span>
            <p className="text-body text-fg-muted">{s.text}</p>
          </li>
        ))}
        <li className="flex flex-col gap-2 bg-surface p-panel">
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-border-strong text-fg-muted">
              <FileDown className="size-3.5" />
            </span>
            <span className="text-heading text-fg">Report</span>
          </span>
          <p className="text-body text-fg-muted">
            Export the campaign as a data package: analysis, proposals and measured results, each traced to the analysis that produced it.
          </p>
        </li>
      </ol>
      <p className="text-caption text-fg-muted">Steps 1 to 3 repeat every round. The report is available whenever you need it.</p>
    </section>
  );
}

/** What Kalos needs to start, and what it promises to show. Plain statements, no claims. */
export function WhatKalosNeeds({ className }: { className?: string }) {
  return (
    <section aria-label="What Kalos needs and what it shows" className={cn("grid gap-8 md:grid-cols-2", className)}>
      <div className="flex flex-col gap-3">
        <h2 className="text-heading text-fg">What Kalos needs</h2>
        <ul className="flex flex-col gap-3 text-body text-fg-muted">
          <li>
            <span className="text-fg">One target to maximize or minimize.</span> A numeric column in your sheet, such as titer or an impurity.
          </li>
          <li>
            <span className="text-fg">A sheet of prior runs.</span> One row per run, with the process inputs and the measured target (.csv, .tsv or
            .xlsx).
          </li>
          <li>
            <span className="text-fg">Bounds only if you want them.</span> Proposals stay inside the range your runs already cover. You can narrow it with
            bounds and linear constraints, but never widen it.
          </li>
        </ul>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-heading text-fg">What you will always see</h2>
        <ul className="flex flex-col gap-3 text-body text-fg-muted">
          <li className="flex gap-2.5">
            <span className="mt-1.5 flex shrink-0 gap-1">
              <MeasuredMark />
              <PredictedMark />
            </span>
            <span>
              <span className="text-fg">Measured and predicted, never mixed.</span> Measured results are filled dots; predictions are rings and carry
              their interval.
            </span>
          </li>
          <li>
            <span className="text-fg">A source for every number.</span> Each analysis names its dataset, time, engine version and provenance hash.
            Where the engine has no value, Kalos shows n/a.
          </li>
          <li>
            <span className="text-fg">Plain refusals.</span> When the data cannot support an answer, Kalos says so and says what data would help.
          </li>
        </ul>
      </div>
    </section>
  );
}
