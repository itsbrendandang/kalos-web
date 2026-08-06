/** The one way every write in the workspace reports a refusal.
 *
 *  `reason` is always shown verbatim: the engine authors these strings
 *  (kalos's `CampaignError`) precisely so a client can repeat them - "result
 *  value must be a finite number", "the campaign changed during re-analysis",
 *  "no measured runs to fold" - and flattening any of them into "something
 *  went wrong" would throw away the only part that tells the reader what to
 *  do next. The unreachable-engine case gets its own sentence from the
 *  adapter and lands here through the same path, so a failed write never
 *  reads as a successful one. */
export function MutationError({ reason }: { reason: string }) {
  return (
    <p role="alert" className="mt-3 rounded-[10px] bg-amber-soft px-3.5 py-2.5 text-[12px] leading-[1.5] text-amber">
      <span className="font-semibold">Nothing was written.</span> {reason}
    </p>
  );
}
