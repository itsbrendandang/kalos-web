/*
 * What the engine's model verdict did to the batch (trust layer F04,
 * feat/trust-calibration docs/CAMPAIGNS_API.md "Verdict and trust gates that
 * gate"). Pure, no React. Every field is optional: older analyses have none of
 * them and render exactly as before.
 *
 *  - reliable -> each proposal `trust.status: "trusted"` (read "model_guided" too): model-guided.
 *  - not_yet  -> each proposal `trust.status: "exploration_untrusted"`: labelled
 *               "exploration: model not trusted yet", never a recommendation.
 *  - refused  -> `proposals: []`, `refusal: {code, plain, what_would_help}`: no batch, and the reason.
 */
import type { AnalyzeResult, Proposal, ProposalTrustBlock } from "@/lib/api";

/** The label every exploration proposal carries, verbatim on every surface. */
export const EXPLORATION_LABEL = "exploration: model not trusted yet";
export const MODEL_GUIDED_LABEL = "model-guided";

export type ProposalTrust = {
  kind: "model-guided" | "exploration";
  label: string;
  /** The engine's sentence for it, when sent. */
  message: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function fromStatus(status: string | null, message: string | null): ProposalTrust | null {
  if (status === "trusted" || status === "model_guided") return { kind: "model-guided", label: MODEL_GUIDED_LABEL, message };
  if (status === "exploration_untrusted" || status === "exploration") return { kind: "exploration", label: EXPLORATION_LABEL, message };
  return null;
}

/**
 * A proposal's trust label: its own `trust` (an object or a bare status string), else the batch's
 * `proposal_trust.status`. Null on older analyses (no label, nothing guessed).
 */
export function proposalTrustOf(p: Pick<Proposal, "trust">, batch?: ProposalTrustBlock | null): ProposalTrust | null {
  const t = p.trust;
  if (typeof t === "string") return fromStatus(t, str(batch?.message));
  if (t && typeof t === "object") return fromStatus(str(t.status), str(t.message) ?? str(batch?.message));
  return batch ? fromStatus(str(batch.status), str(batch.message)) : null;
}

/** The batch-level label when every proposal shares one (the engine labels the whole batch from one verdict). */
export function batchTrustOf(d: Pick<AnalyzeResult, "proposals" | "proposal_trust">): ProposalTrust | null {
  const each = (d.proposals ?? []).map((p) => proposalTrustOf(p, d.proposal_trust));
  if (each.length && each.every((t) => t && t.kind === each[0]!.kind)) return each[0];
  return d.proposal_trust ? fromStatus(str(d.proposal_trust.status), str(d.proposal_trust.message)) : null;
}

export type ModelRefusalView = {
  title: string;
  /** The engine's plain sentence, then each verdict reason (deduplicated). */
  reasons: string[];
  fix: string | null;
  code: string | null;
};

/**
 * Why there is no batch when the verdict refused (`refusal`, `proposal_trust.withheld`, `verdict.state` refused).
 * Null when the model was not refused. The engine's words, never the app's guess.
 */
export function modelRefusalOf(d: Pick<AnalyzeResult, "refusal" | "proposal_trust" | "verdict" | "proposal_notice">): ModelRefusalView | null {
  const r = d.refusal && typeof d.refusal === "object" ? d.refusal : null;
  const refused = r != null || d.proposal_trust?.withheld === true || d.proposal_trust?.status === "withheld" || d.verdict?.state === "refused";
  if (!refused) return null;
  const reasons = [str(r?.plain) ?? str(d.verdict?.headline) ?? str(d.proposal_trust?.message), ...(d.verdict?.reasons ?? []).map((x) => str(x?.plain))].filter(
    (x): x is string => x != null,
  );
  const unique = [...new Set(reasons)];
  return {
    title: "No proposals: the engine withheld the batch because the model cannot be trusted yet",
    reasons: unique.length ? unique : [str(d.proposal_notice?.message) ?? "The engine withheld the batch and gave no reason."],
    fix: str(r?.what_would_help),
    code: str(r?.code) ?? str(d.verdict?.code),
  };
}
