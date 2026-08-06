import { Diamond } from "lucide-react";

/** Design spec 1.3.E. The section rule that introduces the proposals card:
 *  which round is open, when the agent last spoke, a flexible hairline, and
 *  who the batch is waiting on. Sits directly on the canvas between two
 *  planes, not inside either of them. */
export function RoundDivider({
  roundNumber,
  /** Relative age of the most recent analysis ("3h ago"), or null when the
   *  engine did not timestamp one. The engine records when it last FIT, not
   *  when it last proposed, so the chip is titled to say exactly that rather
   *  than implying the agent wrote the batch at that moment. */
  agentAge,
  /** How many of the open round's proposals nobody has booked yet - the
   *  batch that is genuinely waiting on the reader. A recipe already booked
   *  into the lab is waiting on a measurement, not on a decision, so it is
   *  deliberately NOT counted here (the stat strip's "Awaiting results"
   *  cell is where those live). */
  awaitingDecisionCount,
}: {
  roundNumber: number | null;
  agentAge: string | null;
  awaitingDecisionCount: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12.5px] font-bold tracking-[-0.005em] whitespace-nowrap text-fg">
        {roundNumber != null ? `Round ${roundNumber} · open` : "Open round"}
      </span>

      {agentAge && (
        <span
          className="flex items-center gap-1.5 rounded-[20px] bg-blue-tint py-[3px] pr-[9px] pl-1"
          title="When the engine last fitted this campaign"
        >
          <span className="grid size-[18px] shrink-0 place-items-center rounded-[9px] bg-action text-white">
            <Diamond className="size-[9px]" fill="currentColor" />
          </span>
          <span className="text-[11.5px] text-muted">Agent · fitted {agentAge}</span>
        </span>
      )}

      <span className="h-px flex-1 bg-border" aria-hidden />

      {/* The design ends this rule with "Awaiting [AO] you" - an avatar and
          initials for the signed-in scientist. kalos has no accounts, so
          there are no initials to put there and no way to know the batch is
          waiting on the reader specifically rather than on whoever opens it
          next. The sentence says what is true: a decision is outstanding. */}
      <span className="flex items-center gap-1.5">
        <span className="text-[11.5px] whitespace-nowrap text-muted">
          {awaitingDecisionCount > 0 ? (
            <>
              Awaiting a decision on{" "}
              <span className="font-semibold text-fg">
                {awaitingDecisionCount} recipe{awaitingDecisionCount === 1 ? "" : "s"}
              </span>
            </>
          ) : (
            "Nothing awaiting"
          )}
        </span>
      </span>
    </div>
  );
}
