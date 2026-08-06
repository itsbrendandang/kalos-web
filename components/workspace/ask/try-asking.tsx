/** Design spec section 1.4, "Try asking". The spec draws three clickable
 *  suggestion buttons; there is nothing for a click to do, so these are static
 *  rows with the same geometry and no hover, cursor, or focus affordance. They
 *  stay because they are the clearest statement of what this panel is meant to
 *  answer - scope, not a control. The caption says so, so nobody waits for a
 *  reply after reading them. */
import { cn } from "@/lib/utils";
import { AskLabel } from "./primitives";

/** Deliberately campaign-agnostic. The design's own three examples name
 *  things that do not exist ("the Fc-fusion pilot", a round that "lost 18
 *  days", a row 3 that happens to be an exploration pick) - illustrative copy
 *  from the mock, rendering unbadged against whatever real campaign is open.
 *  These three ask the same shape of question while asserting nothing, and
 *  each points at a surface the workspace genuinely has: the batch's
 *  explore/exploit split, the driver chart, and the activity strip. */
const SUGGESTIONS = [
  "Why is this batch exploring rather than exploiting?",
  "Which input is driving the target hardest, and how sure are we?",
  "Where did this campaign lose the most time between rounds?",
];

export function TryAsking({ className }: { className?: string }) {
  return (
    <section className={cn("flex flex-col gap-[7px]", className)}>
      <AskLabel>Try asking</AskLabel>
      <p className="text-[11px] leading-[1.5] text-muted">
        The shape of question this panel is for. None of them run today.
      </p>
      <ul className="flex flex-col gap-[5px]">
        {SUGGESTIONS.map((s) => (
          <li key={s} className="rounded-[9px] border border-border px-[11px] py-2 text-[12px] leading-[1.4] text-fg">
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}
