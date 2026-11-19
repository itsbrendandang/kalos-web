import Link from "next/link";
import { ArrowDown, FlaskConical, Scale } from "lucide-react";
import { StepBadge } from "@/components/kit/cycle-stepper";
import { HOME_ROUTE } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The staged path to scale, as a map, not a tracker. The engine stores no
 * stages and no gate decisions, so every stage is drawn in the same neutral
 * "upcoming" style: nothing here is ever shown as done or current. Each stage
 * names the evidence Kalos can actually compute for it; the gates between
 * them are the team's own go/no-go calls.
 */

type Stage = {
  n: number;
  name: string;
  scale: string;
  evidence: "campaign" | "report";
};

const STAGES: readonly Stage[] = [
  { n: 1, name: "Media screen", scale: "High-throughput plates, many media side by side", evidence: "campaign" },
  { n: 2, name: "Microbioreactors", scale: "High-throughput, about 100 µL to 3 mL", evidence: "campaign" },
  { n: 3, name: "Shake flasks", scale: "About 50 to 250 mL", evidence: "campaign" },
  { n: 4, name: "Bench bioreactor", scale: "About 0.5 to 1 L", evidence: "campaign" },
  { n: 5, name: "Pilot bioreactor", scale: "About 2 to 50 L", evidence: "campaign" },
  { n: 6, name: "Data package and handoff", scale: "Results and provenance for the next team", evidence: "report" },
];

/** Stages whose step to the next one is a change of vessel scale (1 to 2 ... 4 to 5). */
const isScaleStep = (n: number) => n < 5;

export function ScaleTrack({ readoutHref = "#readout" }: { readoutHref?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <ol className="grid gap-0 lg:grid-cols-6 lg:gap-0">
        {STAGES.map((s, i) => {
          const last = i === STAGES.length - 1;
          return (
            <li key={s.n} className="flex gap-3 lg:flex-col lg:gap-3">
              {/* The rail: vertical on small screens, horizontal from lg. */}
              <div className="flex flex-col items-center lg:flex-row lg:items-center" aria-hidden>
                <StepBadge n={s.n} state="upcoming" />
                {!last ? (
                  <span className="relative flex flex-1 items-center justify-center lg:h-6">
                    <span className="block h-full w-px bg-border-strong lg:h-px lg:w-full" />
                    {isScaleStep(s.n) ? (
                      <Scale className="absolute hidden size-4 bg-bg px-0.5 text-fg-muted lg:block" />
                    ) : null}
                  </span>
                ) : null}
              </div>

              <div className={cn("min-w-0 flex-1 pb-6 lg:pr-4 lg:pb-0", last && "pb-0")}>
                <h3 className="text-label text-fg">
                  <span className="sr-only">Stage {s.n}: </span>
                  {s.name}
                </h3>
                <p className="mt-0.5 text-caption text-fg-muted lg:min-h-8">{s.scale}</p>

                <dl className="mt-3 flex flex-col gap-2 text-caption">
                  <div>
                    <dt className="text-fg-muted">Evidence in Kalos</dt>
                    <dd className="mt-0.5 text-fg">
                      {s.evidence === "campaign" ? (
                        <>
                          Run a campaign at this scale: the Harmonize, Predict, Validate loop.{" "}
                          <Link href={HOME_ROUTE.href} className="text-accent underline-offset-4 hover:underline">
                            Campaigns
                          </Link>
                        </>
                      ) : (
                        <>
                          The Report and export in each campaign.{" "}
                          <Link href={HOME_ROUTE.href} className="text-accent underline-offset-4 hover:underline">
                            Campaigns
                          </Link>
                        </>
                      )}
                    </dd>
                  </div>
                  {isScaleStep(s.n) ? (
                    <div>
                      <dt className="text-fg-muted">To the next scale</dt>
                      <dd className="mt-0.5 text-fg">
                        <a href={readoutHref} className="inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline">
                          Scale-up readout
                          <ArrowDown className="size-3.5" aria-hidden />
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-fg-muted">Gate</dt>
                    <dd className="mt-0.5 text-fg">Go/no-go: your team&apos;s decision. Kalos does not record stage decisions yet.</dd>
                  </div>
                </dl>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-caption text-fg-muted">
        <p className="flex items-start gap-2">
          <Scale className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            Between scales, the scale-up readout below predicts the next scale from your multi-scale data, or refuses and says what data
            is missing.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <FlaskConical className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            No stage is tracked or completed by the software: this is a map of the path, not a record of where your program is.
          </span>
        </p>
      </div>
    </div>
  );
}
