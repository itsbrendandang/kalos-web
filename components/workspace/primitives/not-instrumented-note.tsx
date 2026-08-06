/** Shared "honest gap" treatment for anything the engine genuinely cannot
 *  serve yet (no well/plate concept, an endpoint not shipped, an analysis
 *  that hasn't run). Distinctively named so it doesn't collide with the
 *  Map-tab build - see components/workspace/log/*.tsx for every call site.
 *  Mirrors the tone CampaignRail already established for its own gap
 *  ("Evidence stats aren't instrumented yet.") rather than inventing a new
 *  visual language for "we don't have this". */
export function NotInstrumentedNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[11px] leading-[1.5] text-muted ${className ?? ""}`}>{children}</p>;
}
