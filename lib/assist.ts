/*
 * Pure rules for the assistant: the next-step guide and the question panel.
 * The shapes match the engine's /api/assist routes (kalos docs/ASSISTANT.md).
 * Nothing here invents a claim: the step, the answer and every quote come
 * from the engine, or from the campaign state through lib/agent.ts when the
 * engine has no guide route yet. Tested in __tests__/assist.test.ts.
 */
import { CAMPAIGN_STAGES } from "@/lib/routes";

/**
 * The guide's state codes. The engine is renaming the two that say "batch"
 * (batch_proposed -> recipes_proposed, no_batch -> no_recipes); both the old
 * and the new name are accepted, so either engine works.
 */
export const NEXT_STATE_ALIASES: Readonly<Record<string, string>> = { batch_proposed: "recipes_proposed", no_batch: "no_recipes" };

/** A guide state code with the old names mapped to the new ones. */
export function nextState(next: Pick<AssistNext, "state"> | null | undefined): string | null {
  const s = next?.state;
  if (!s) return null;
  return NEXT_STATE_ALIASES[s] ?? s;
}

/** GET /api/assist/next. `state` is a stable code; the words are the engine's. */
export type AssistNext = {
  state?: string;
  /** One sentence: what to do now. */
  step: string;
  /** One or two sentences: why that is next. */
  why: string;
  /** What this step means for the lab's work, and what goes wrong if it is skipped. */
  why_it_matters?: string;
  /** A web path, one of the campaign stage pages. */
  action_route: string;
  /** What stands in the way, in plain words. Empty when nothing does. */
  blockers: AssistBlocker[];
  campaign_id?: string | null;
  /** The button's words. The engine does not send one; the web derives it from the route. */
  action?: string;
};

/** One thing in the way: a stable code, the plain sentence, and the plain why-line. */
export type AssistBlocker = { code: string; text: string; why: string };

export type AssistSourceKind = "sheet" | "round" | "finding" | "analysis" | "doc" | "skill";

export type AssistSource = {
  kind: AssistSourceKind;
  id: string;
  /** Verbatim from the sheet, round, finding or page. At most 300 characters. */
  quote: string;
  campaign_id?: string | null;
};

/** POST /api/assist/ask. `next` is the guide's step at the time of the answer. */
export type AssistAnswer = {
  answer: string;
  sources: AssistSource[];
  /** True when nothing in your data answered the question. `answer` is then the guide's step. */
  abstained: boolean;
  next?: AssistNext;
};

export type AssistProvider = "ollama" | "anthropic" | "none" | (string & {});

/** GET /api/assist/index/status. */
export type AssistIndexStatus = {
  provider: AssistProvider;
  model: string | null;
  /** True when answers are worked out on this machine and nothing is sent away. */
  local: boolean;
  chunks: number;
  built_at: string | null;
  building: boolean;
  retriever?: "embeddings" | "bm25";
};

/**
 * Why the assistant cannot answer right now. "absent": an older engine
 * without the routes. "off": the engine says the assistant is turned off.
 * "unavailable": the model behind it did not answer.
 */
export type AssistUnavailableReason = "absent" | "off" | "unavailable";

export class AssistUnavailableError extends Error {
  constructor(public readonly reason: AssistUnavailableReason) {
    super(`assistant ${reason}`);
    this.name = "AssistUnavailableError";
  }
}

/**
 * A plain sentence for a failed assistant call, or null when the caller has its
 * own words. 429 rate_limited: too many questions in a row (Retry-After, when
 * sent, becomes a wait). 409 limit_reached: a tenant's draft count or a draft's
 * version count is at its ceiling.
 */
export function assistLimitLine(err: unknown, what: "question" | "draft" | "version"): string | null {
  if (!err || typeof err !== "object" || !("status" in err) || !("code" in err)) return null;
  const { status, code, retryAfter } = err as { status: number; code: string; retryAfter?: number };
  if (status === 429 || code === "rate_limited") {
    const wait = retryAfter != null && retryAfter > 0 ? ` Wait ${retryAfter} ${retryAfter === 1 ? "second" : "seconds"}, then ask again.` : " Wait a moment, then ask again.";
    return `Too many ${what === "question" ? "questions" : "changes"} in a row.${wait}`;
  }
  if (status === 409 || code === "limit_reached") {
    if (what === "draft") return "This campaign has as many drafts as Kalos keeps (500). Delete is not possible; export what you need and reuse a draft.";
    return "This draft has as many versions as Kalos keeps (200). Start a new draft from the same record to go on.";
  }
  return null;
}

/** Maps an engine error status and code to the reason, or null when it is some other failure. */
export function assistUnavailableReason(status: number, code: string | null | undefined): AssistUnavailableReason | null {
  if (status === 404) return code === "assist_disabled" ? "off" : "absent";
  if (status === 405) return "absent";
  if (status === 503) return "unavailable";
  return null;
}

/** The stage page a guide route points to, or null when it is not a stage page. */
export function stageForRoute(route: string) {
  return CAMPAIGN_STAGES.find((s) => s.href === route) ?? null;
}

/** The button's words for a next step: the engine's own when present, else "Open <stage>". */
export function nextActionLabel(next: Pick<AssistNext, "action" | "action_route">): string {
  if (next.action) return next.action;
  const stage = stageForRoute(next.action_route);
  return stage ? `Open ${stage.label}` : "Open the next step";
}

/**
 * Where a source chip links to: the sheet, the round, the finding or the
 * page the quote came from. Null when the app has no page for it (a doc or
 * skill lives in the engine's own files), so the chip shows the quote only.
 */
export function sourceHref(source: Pick<AssistSource, "kind" | "id">): string | null {
  const id = source.id;
  switch (source.kind) {
    case "sheet":
      return /^[0-9a-f]{64}$/i.test(id) ? `/data/sheet/${id}` : "/data";
    case "round":
      // The engine counts rounds from 0; the app's pages and people count from 1 (displayRound in lib/campaign-stage.ts).
      return /^\d{1,6}$/.test(id) ? `/data/round/${Number(id) + 1}` : "/data";
    case "finding":
      return /^[a-z0-9_.-]{1,80}$/i.test(id) ? `/campaign/learn#${id}` : "/campaign/learn";
    case "analysis":
      return id === "proposals" ? "/campaign/plan" : "/campaign/learn";
    default:
      return null;
  }
}

/** The engine's analysis sections in plain words (kalos/assist/index.py ids). */
const ANALYSIS_LABEL: Record<string, string> = {
  verdict: "The verdict",
  drivers: "What went with the target",
  proposals: "Proposed recipes",
  best_run: "Best measured run",
  round_delta: "Since last round",
  refusal: "Why no recipes",
  promotion: "Model checks",
  cv: "Model checks",
  noise: "Run-to-run spread",
};

const KIND_LABEL: Record<AssistSourceKind, string> = {
  sheet: "Sheet",
  round: "Round",
  finding: "Finding",
  analysis: "Model results",
  doc: "Guide page",
  skill: "Method",
};

/** The chip's words: the kind in plain words, then the id where it means something to a reader. */
export function sourceLabel(source: Pick<AssistSource, "kind" | "id">): string {
  const kind = KIND_LABEL[source.kind] ?? "Source";
  switch (source.kind) {
    case "sheet":
      return `${kind} ${source.id.slice(0, 7)}`;
    case "round":
      return /^\d{1,6}$/.test(source.id) ? `${kind} ${Number(source.id) + 1}` : kind;
    case "finding":
      return `${kind}: ${source.id.replace(/\.\d+$/, "").replace(/_/g, " ")}`;
    case "doc":
      return `${kind}: ${source.id.replace(/^.*\//, "").replace(/\.md$/i, "").replace(/[_-]/g, " ")}`;
    case "skill":
      return `${kind}: ${source.id.replace(/-/g, " ")}`;
    case "analysis":
      return ANALYSIS_LABEL[source.id] ?? kind;
    default:
      return kind;
  }
}

/**
 * Whether a quoted number is a measurement or a model's estimate. The engine
 * writes the word next to the number; the panel keeps it visible as a label
 * so a reader never mistakes one for the other. Null when the text carries
 * no number, or no such word.
 */
export function numberLabel(text: string): "Measured" | "Predicted" | null {
  if (!/\d/.test(text)) return null;
  const measured = /\bmeasured\b/i.test(text);
  const predicted = /\bpredicted\b/i.test(text);
  if (measured && !predicted) return "Measured";
  if (predicted && !measured) return "Predicted";
  return null;
}

/** One line on where the model runs, from the index status. */
export function whereItRuns(status: Pick<AssistIndexStatus, "provider" | "local" | "model">): string {
  if (status.provider === "none") return "The assistant is off.";
  if (status.local) return `Runs on this Mac${status.model ? ` (${status.model})` : ""}. Nothing leaves it.`;
  return `Questions and the matching parts of your data are sent to ${providerName(status.provider)}.`;
}

export function providerName(provider: AssistProvider): string {
  if (provider === "ollama") return "Ollama";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "none") return "Off";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** True when answers leave the machine, so the consent paragraph must show. */
export function isCloudProvider(status: Pick<AssistIndexStatus, "provider" | "local">): boolean {
  return status.provider !== "none" && !status.local;
}

/** The index line for Settings: how much is indexed and when. */
export function indexLine(status: Pick<AssistIndexStatus, "chunks" | "built_at" | "building">, now: Date = new Date()): string {
  if (status.building) return "Rebuilding the index now.";
  if (!status.built_at || status.chunks === 0) return "Nothing is indexed yet.";
  const built = new Date(status.built_at);
  const when = Number.isNaN(built.getTime()) ? "" : ` ${relativeTime(built, now)}`;
  return `${status.chunks} ${status.chunks === 1 ? "passage" : "passages"} from your sheets, rounds and results, indexed${when}.`;
}

function relativeTime(then: Date, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

/** Keeps the engine's envelope honest: a malformed guide must never reach a page as a half-filled card. */
export function isAssistNext(v: unknown): v is AssistNext {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const blocker = (b: unknown) => !!b && typeof b === "object" && typeof (b as AssistBlocker).text === "string";
  // Only a stage page of this app may become the card's link: a route the engine made up never reaches <Link href>.
  return typeof o.step === "string" && o.step.length > 0 && typeof o.why === "string" && typeof o.action_route === "string" && stageForRoute(o.action_route) != null && Array.isArray(o.blockers) && o.blockers.every(blocker);
}

export function isAssistAnswer(v: unknown): v is AssistAnswer {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const sources = Array.isArray(o.sources) && o.sources.every((s) => s && typeof s === "object" && typeof (s as AssistSource).kind === "string" && typeof (s as AssistSource).id === "string" && typeof (s as AssistSource).quote === "string");
  return typeof o.answer === "string" && typeof o.abstained === "boolean" && sources && (o.next === undefined || isAssistNext(o.next));
}

export function isAssistIndexStatus(v: unknown): v is AssistIndexStatus {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.provider === "string" && typeof o.local === "boolean" && typeof o.chunks === "number" && typeof o.building === "boolean" && (o.built_at === null || typeof o.built_at === "string");
}
