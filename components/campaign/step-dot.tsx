import { Check } from "lucide-react";
import type { StepState } from "@/lib/campaign-stage";

/** A stage's state as a small mark: done (tick), current (ringed), upcoming (empty). Always paired with words by the caller. */
export function StepDot({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <span className="grid size-4 place-items-center rounded-full bg-good text-bg">
        <Check className="size-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  if (state === "current") return <span className="size-4 rounded-full border-[5px] border-accent" aria-hidden />;
  return <span className="size-4 rounded-full border-[1.5px] border-border-strong" aria-hidden />;
}
