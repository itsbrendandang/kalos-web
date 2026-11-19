import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { formatVolume } from "@/lib/num";
import { HOME_ROUTE } from "@/lib/routes";
import { cn } from "@/lib/utils";

/*
 * The staged path to scale, drawn toward C11 StageGateTrack (VIZ_SPEC 5).
 * The engine keeps no stage registry and records no gate decisions, so:
 *  - no stage is ever done or current (no fake states, nothing auto-advances);
 *  - every gate is a HOLLOW diamond, "gate open: no decision recorded";
 *  - the evidence column says no Kalos data is linked to the stage;
 *  - the decision column is a separate dashed panel for the team's call,
 *    never pre-filled from evidence.
 * Stage volumes are the program's nominal ranges, printed through formatVolume.
 */

type Stage = {
  key: "S1" | "S2" | "S3" | "S4" | "S5" | "S6";
  name: string;
  /** Nominal vessel range in liters, or a description when the stage has no volume. */
  liters: [number, number] | null;
  note: string;
};

const STAGES: readonly Stage[] = [
  { key: "S1", name: "Media screen", liters: null, note: "High-throughput plates, many media side by side" },
  { key: "S2", name: "Microbioreactors", liters: [100e-6, 3e-3], note: "High-throughput vessels" },
  { key: "S3", name: "Shake flasks", liters: [50e-3, 250e-3], note: "Flask culture" },
  { key: "S4", name: "Bench bioreactor", liters: [0.5, 1], note: "Controlled bench vessel" },
  { key: "S5", name: "Pilot bioreactor", liters: [2, 50], note: "Pilot scale" },
  { key: "S6", name: "Data package and handoff", liters: null, note: "Results and provenance for the next team" },
];

/** "100 µL to 3 mL", or null for a stage with no vessel volume. */
export function stageVolume(s: Pick<Stage, "liters">): string | null {
  return s.liters ? `${formatVolume(s.liters[0]).text} to ${formatVolume(s.liters[1]).text}` : null;
}

/** The hollow gate diamond: open, no decision recorded. Filled is reserved for a recorded decision, which the engine cannot store. */
function GateDiamond({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" className={cn("size-3.5 shrink-0", className)} aria-hidden>
      <path d="M7 1.2 L12.8 7 L7 12.8 L1.2 7 Z" fill="var(--bg)" stroke="var(--chart-reference)" strokeWidth="1.5" />
    </svg>
  );
}

export function ScaleTrack({ readoutHref = "#readout" }: { readoutHref?: string }) {
  return (
    <div className="flex flex-col gap-6">
      <ol className="grid gap-0 lg:grid-cols-6" aria-label="Stages and gates">
        {STAGES.map((s, i) => {
          const last = i === STAGES.length - 1;
          const volume = stageVolume(s);
          return (
            <li key={s.key} className="flex gap-3 lg:flex-col lg:gap-3">
              {/* The rail: a hairline stage node, then the connector with the gate diamond to the next stage. */}
              <div className="flex flex-col items-center lg:flex-row lg:items-center" aria-hidden>
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border-strong bg-bg text-caption text-fg-muted tabular-nums">
                  {s.key}
                </span>
                {!last ? (
                  <span className="relative flex min-h-10 flex-1 items-center justify-center lg:h-7 lg:min-h-0">
                    <span className="block h-full w-px bg-border-strong lg:h-px lg:w-full" />
                    <GateDiamond className="absolute" />
                  </span>
                ) : null}
              </div>

              <div className={cn("min-w-0 flex-1 pb-6 lg:pr-4 lg:pb-0", last && "pb-0")}>
                <h3 className="text-label text-fg">
                  <span className="sr-only">Stage {s.key}: </span>
                  {s.name}
                </h3>
                <p className="mt-0.5 text-caption text-fg-muted tabular-nums lg:min-h-8">{volume ? `${volume}, ${s.note.toLowerCase()}` : s.note}</p>

                <dl className="mt-3 flex flex-col gap-2 text-caption">
                  <div>
                    <dt className="text-fg-muted">Evidence, computed by Kalos</dt>
                    <dd className="mt-0.5 text-fg">No Kalos data linked to this stage</dd>
                  </div>
                  {!last ? (
                    <div>
                      <dt className="text-fg-muted">Gate to {STAGES[i + 1].key}</dt>
                      <dd className="mt-0.5 flex items-center gap-1.5 text-fg">
                        <GateDiamond />
                        gate open: no decision recorded
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="gate-evidence" className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-panel">
          <h3 id="gate-evidence" className="text-label text-fg">
            Evidence, computed by Kalos
          </h3>
          <p className="text-body text-fg-muted">
            No Kalos data is linked to any stage: the engine has no stage registry, so a campaign or readout cannot be attached to a stage yet.
            Evidence you can produce today:
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg marker:text-fg-muted">
            <li>
              A campaign at one scale (Harmonize, Predict, Validate):{" "}
              <Link href={HOME_ROUTE.href} className="text-accent underline-offset-4 hover:underline">
                Campaigns
              </Link>
            </li>
            <li>
              A prediction or refusal for the next scale from your multi-scale data:{" "}
              <a href={readoutHref} className="inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline">
                Scale-up readout
                <ArrowDown className="size-3.5" aria-hidden />
              </a>
            </li>
          </ul>
        </section>
        <section aria-labelledby="gate-decision" className="flex flex-col gap-2 rounded-xl border border-dashed border-border-strong p-panel">
          <h3 id="gate-decision" className="text-label text-fg">
            Decision, recorded by your team
          </h3>
          <p className="flex items-center gap-2 text-body text-fg">
            <GateDiamond />
            No decision recorded
          </p>
          <p className="text-body text-fg-muted">
            Go, no-go and hold are your team&apos;s calls. Kalos does not store gate decisions yet, so none is shown here and no stage is ever
            marked done.
          </p>
        </section>
      </div>
    </div>
  );
}
