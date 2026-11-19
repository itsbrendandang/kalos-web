/*
 * The trust caveat every PROPOSAL interval carries (REDESIGN_DIRECTION,
 * "PRIORITY: trust layer"). A prediction band's coverage is measured on
 * held-out past runs; proposals are chosen for high predicted values, so at
 * the recipes the user actually runs the band covers less than its nominal
 * level. The app never writes "calibrated" next to a proposal without this
 * caveat, and never claims a coverage it did not get from the engine.
 *
 * Source, in order:
 *  1. the engine's own caveat on the interval entry (`intervals[].caveat`,
 *     `conformal_caveat` for the global band, else
 *     `interval_method.coverage_at_proposals[level]`): its message verbatim,
 *     its `coverage_at_proposals_estimate` and the band's `interval_basis` /
 *     `coverage_basis` shown next to it;
 *  2. an estimate without a message: a sentence built from its numbers;
 *  3. older engines: the fixed text below.
 * Pure, no React.
 */
import { coverageText } from "@/lib/num";

/** The fixed caveat while the engine sends no coverage-at-proposals evidence (REDESIGN_DIRECTION, trust layer). */
export const PROPOSAL_INTERVAL_CAVEAT =
  "Calibrated on held-out runs similar to past runs; at proposed recipes coverage measured lower in simulation (about 60-80% for a nominal 90%).";

/** `coverage_at_proposals_estimate` as the engine sends it (compact per proposal, full once per analysis). */
export type CoverageAtProposalsEstimate = {
  nominal: number;
  measured_min: number;
  measured_max: number;
  basis?: string | null;
  source?: unknown;
  benchmark?: string | null;
};

/** The engine's structured caveat on a proposal interval (`intervals[].caveat`, `conformal_caveat`). */
export type EngineIntervalCaveat = {
  code?: string | null;
  message?: string | null;
  coverage_at_proposals_estimate?: CoverageAtProposalsEstimate | null;
  coverage_basis?: string | null;
  interval_basis?: string | null;
};

/** The fields of an interval entry (or the global band's `conformal_caveat`) the caveat reads. */
export type CaveatFields = {
  caveat?: EngineIntervalCaveat | null;
  coverage_basis?: string | null;
  interval_basis?: string | null;
  coverage_at_proposals_estimate?: CoverageAtProposalsEstimate | null;
};

export type ProposalCaveat = {
  /** The sentence shown with the interval. */
  text: string;
  /** "engine": the engine's own caveat or estimate; "static": the fixed text (older engines). */
  from: "engine" | "static";
  code: string | null;
  /** The engine's basis code (`interval_basis`, else `coverage_basis`), null when not sent. */
  basis: string | null;
  /** The basis in plain words, null when not sent. */
  basisText: string | null;
  estimate: { nominal: number; min: number; max: number; basis: string | null } | null;
  /** "measured 60-81% at proposals in simulation, nominal 90%", null without an estimate. */
  estimateText: string | null;
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const BASIS_TEXT: Record<string, string> = {
  held_out_past_runs: "held-out runs similar to past runs",
  held_out_top_ranked_runs: "the held-out past runs the model ranked highest",
  model_based: "model-based (GP posterior)",
};

/** The engine's basis code in plain words; unknown codes as sent, underscores spaced. */
export const basisText = (code: string | null): string | null => (code ? (BASIS_TEXT[code] ?? code.replace(/_/g, " ")) : null);

/** Whole percent, rounded down (as the engine does), so a measured 0.995 never reads as 100%. */
const floorPct = (v: number) => `${Math.floor(v * 100 + 1e-9)}`;

function readEstimate(e: CoverageAtProposalsEstimate | null | undefined): ProposalCaveat["estimate"] {
  if (!e || typeof e !== "object" || !finite(e.measured_min) || !finite(e.measured_max)) return null;
  return { nominal: finite(e.nominal) ? e.nominal : NaN, min: e.measured_min, max: e.measured_max, basis: str(e.basis) };
}

/** "measured 60-81% at proposals in simulation, nominal 90%". */
export function estimateText(est: NonNullable<ProposalCaveat["estimate"]>): string {
  const range = est.min === est.max ? `${floorPct(est.min)}%` : `${floorPct(est.min)}-${floorPct(est.max)}%`;
  const nominal = coverageText(Number.isFinite(est.nominal) ? est.nominal : null);
  return `measured ${range} at proposals${est.basis ? ` in ${est.basis}` : ""}${nominal ? `, nominal ${nominal}` : ""}`;
}

/** The `interval_method.coverage_at_proposals` entry for a level ("0.9" keys, as the engine writes them). */
export function methodCaveat(method: unknown, coverage: number | null | undefined): EngineIntervalCaveat | null {
  if (!method || typeof method !== "object" || !finite(coverage)) return null;
  const table = (method as Record<string, unknown>).coverage_at_proposals;
  if (!table || typeof table !== "object") return null;
  const hit = Object.entries(table as Record<string, unknown>).find(([k]) => Math.abs(Number(k) - coverage) < 1e-9)?.[1];
  return hit && typeof hit === "object" ? (hit as EngineIntervalCaveat) : null;
}

/**
 * The caveat for one proposal interval. `entry` is the interval itself
 * (`proposals[i].intervals[k]`) or the global band's `conformal_caveat`;
 * `fallback` is the analysis-wide caveat for the same level, if any.
 */
export function proposalCaveat(entry?: CaveatFields | EngineIntervalCaveat | null, fallback?: EngineIntervalCaveat | null, coverage?: number | null): ProposalCaveat {
  const e = (entry ?? {}) as CaveatFields & EngineIntervalCaveat;
  const cav: EngineIntervalCaveat = (e.caveat && typeof e.caveat === "object" ? e.caveat : null) ?? (str(e.message) ? e : null) ?? fallback ?? {};
  const basis = str(e.interval_basis) ?? str(e.coverage_basis) ?? str(cav.interval_basis) ?? str(cav.coverage_basis) ?? str(fallback?.interval_basis) ?? str(fallback?.coverage_basis);
  const estimate = readEstimate(cav.coverage_at_proposals_estimate ?? e.coverage_at_proposals_estimate ?? fallback?.coverage_at_proposals_estimate);
  const estText = estimate ? estimateText(estimate) : null;
  const message = str(cav.message);
  let text: string;
  let from: ProposalCaveat["from"] = "engine";
  if (message) text = message;
  else if (estimate) {
    const nominal = coverageText(Number.isFinite(estimate.nominal) ? estimate.nominal : (coverage ?? null));
    text = `This ${nominal ? `${nominal} ` : ""}band's coverage was measured on ${basisText(basis) ?? "held-out past runs"}, not at proposals. At proposed recipes it ${estText}. Not a guarantee.`;
  } else {
    text = PROPOSAL_INTERVAL_CAVEAT;
    from = "static";
  }
  return { text, from, code: str(cav.code), basis, basisText: basisText(basis), estimate, estimateText: estText };
}

/** Two caveats say the same thing (so a batch shows it once). */
export const sameCaveat = (a: ProposalCaveat, b: ProposalCaveat): boolean => a.text === b.text && a.basis === b.basis && a.estimateText === b.estimateText;

/**
 * The guard the tests use: a rendered proposal area may say "calibrat..." only
 * inside a caveat. Returns the text with every caveat sentence removed.
 */
export function withoutCaveats(text: string, caveats: readonly string[]): string {
  let out = text;
  for (const c of [...new Set(caveats)].sort((a, b) => b.length - a.length)) out = out.split(c).join(" ");
  return out;
}
