import Link from "next/link";
import { Check } from "lucide-react";
import type { CycleStepState } from "@/lib/campaign-stage";
import { cn } from "@/lib/utils";

/**
 * The Harmonize -> Predict -> Validate stepper, the recurring motif of a
 * campaign. States come from the engine's own stage (lib/campaign-stage
 * `cycleSteps`); a step is never marked done without the engine's detail
 * saying why. `active` highlights the page the user is on.
 */
export function CycleStepper({
  steps,
  round,
  active,
  className,
}: {
  steps: CycleStepState[];
  round: number | null;
  active?: CycleStepState["key"];
  className?: string;
}) {
  return (
    <nav aria-label={round != null ? `Round ${round} cycle` : "Campaign cycle"} className={cn("w-full", className)}>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {steps.map((s) => {
          const here = s.key === active;
          return (
            <li key={s.key} className="min-w-0">
              <Link
                href={s.href}
                aria-current={here ? "step" : undefined}
                className={cn(
                  "flex h-full items-start gap-3 rounded-xl border p-tight transition-colors",
                  here ? "border-fg bg-surface" : "border-border bg-surface hover:border-border-strong",
                )}
              >
                <StepBadge n={s.n} state={s.state} />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-label text-fg">
                    {s.label}
                    <span className="text-caption text-fg-muted">{stateWord(s.state)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-caption text-fg-muted">{s.detail || "\u00a0"}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const stateWord = (s: CycleStepState["state"]) => (s === "done" ? "Done" : s === "current" ? "Now" : "Next");

/** A numbered circle: filled ink when done (with a check), accent ring when current, hairline when upcoming. */
export function StepBadge({ n, state, className }: { n: number; state: CycleStepState["state"]; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-caption font-semibold tabular-nums",
        state === "done" && "bg-fg text-bg",
        state === "current" && "border-2 border-accent text-accent",
        state === "upcoming" && "border border-border-strong text-fg-muted",
        className,
      )}
    >
      {state === "done" ? <Check className="size-3.5" /> : n}
    </span>
  );
}
