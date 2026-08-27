import {
  constraintNote,
  designBoxExclusionsNote,
  proposalAuditNote,
  proposalGatingNote,
  type PopulatedResult,
} from "@/lib/api";

/**
 * The audit trail for a recommended batch: whether the search box was
 * narrowed by physically-impossible cells (`design_box_exclusions`), which
 * acquisition optimizer served it and how many in-flight recipes it knew
 * about (`proposal_optimizer`/`n_pending_considered`), whether it was gated
 * by predicted feasibility (`proposal_gating`), and whether a requested
 * constraint was applied (`constraint`).
 *
 * Each line renders only when the engine reported something worth
 * disclosing - the whole block renders nothing on an older engine response,
 * or on a fully-default run with nothing to disclose (unconstrained,
 * ungated, no excluded cells).
 */
export function ProposalDisclosures({ d }: { d: PopulatedResult }) {
  const lines = [
    designBoxExclusionsNote(d.design_box_exclusions),
    proposalAuditNote(d.proposal_optimizer, d.n_pending_considered),
    proposalGatingNote(d.proposal_gating),
    constraintNote(d.constraint),
  ].filter((n): n is string => n != null);
  if (!lines.length) return null;

  return (
    <div className="mb-3 flex flex-col gap-0.5">
      {lines.map((line) => (
        <p key={line} className="text-[11.5px] leading-snug text-muted">
          {line}
        </p>
      ))}
    </div>
  );
}
