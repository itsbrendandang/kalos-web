// Client-side domain types for the campaign workspace (/c/[campaignId]).
//
// These are deliberately NOT the same shapes lib/api.ts exports (its
// `Campaign`/`CampaignRun` types model the single-active-campaign /decide
// loop the engine serves today). The engine is being extended in parallel
// for a real multi-campaign workspace and its response shapes are not final
// yet, so this module defines the shapes the UI wants to render against,
// independent of what the engine currently happens to return. The mapping
// from "whatever the engine returns today" to these types lives in one
// place - ./adapter.ts - so re-pointing it at a future endpoint is a
// one-file change, not a hunt through every component.

/** A single run's outcome. "failed" exists in the vocabulary because the
 *  design calls for it (a run excluded from the fit, not deleted), but the
 *  engine does not model run failure yet - see adapter.ts. */
export type RunStatus = "measured" | "failed" | "proposed";

export type RoundStatus = "open" | "closed";

export type RunMode = "explore" | "exploit";

export type Run = {
  id: string;
  recipe: Record<string, number>;
  status: RunStatus;
  mode: RunMode;
  /** Model prediction at proposal time. Null once/if not applicable (e.g. a
   *  measured run whose prediction was never recorded). */
  predicted: number | null;
  predictedBand: number | null;
  /** The measured outcome, once logged. Null for a proposed/not-yet-run run. */
  measuredValue: number | null;
  reason: string | null;
};

/** A recipe the engine RECOMMENDED but which nobody has booked into the lab
 *  yet, ranked within its round's proposal batch. Distinct from a `Run` in
 *  `Campaign.awaitingRuns`: that one has already been started via
 *  `POST /api/campaign/start` and is out in the lab waiting on a measurement.
 *  Approving a batch is exactly the transition from the former to the latter. */
export type Proposal = {
  id: string;
  rank: number;
  run: Run;
  /** Short human summary of what this proposal changes relative to the
   *  current best (e.g. "Glucose up, feed earlier"). Null when the engine
   *  hasn't supplied one - render nothing rather than invent a description. */
  summary: string | null;
};

export type Round = {
  number: number;
  status: RoundStatus;
  label: string;
  bestValue: number | null;
  dateISO: string | null;
  /** Runs known to belong to this round. Empty when the engine only reports
   *  an aggregate (see adapter.ts) - an empty array here means "not broken
   *  down by round yet", not "zero runs happened". */
  runs: Run[];
};

export type Campaign = {
  id: string;
  name: string;
  objective: string;
  currentRound: number;
  rounds: Round[];
  /** The engine's recommended batch that has NOT been started yet - the
   *  analysis's own proposals (`GET /api/latest`), not the campaign's pending
   *  runs. Approving this batch is what starts them. */
  proposals: Proposal[];
  /** Runs already booked into the open round, out in the lab, awaiting a
   *  measured outcome. */
  awaitingRuns: Run[];
  /** Runs booked and measured but not yet folded into the base data - what a
   *  re-analysis would fold in. */
  measuredRuns: Run[];
};

/** The compact shape the campaign rail renders - one row per campaign. */
export type CampaignSummary = {
  id: string;
  name: string;
  monogram: string;
  statusLine: string;
};
