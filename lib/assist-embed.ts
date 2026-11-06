/*
 * Pure rules for the conversation view: which existing chart or table an
 * answer may carry (by matching the column names a question uses), which
 * full page an answer links to, and the starter prompts worked out from the
 * campaign's state. No chart code lives here. Tested in
 * __tests__/assist-embed.test.ts.
 */
import type { AssistAnswer, AssistNext } from "@/lib/assist";
import { nextState, sourceHref } from "@/lib/assist";

export type EmbedContext = {
  target: string | null;
  inputs: string[];
  /** True when the model reported what went with the target. */
  hasDrivers: boolean;
  /** True when the model proposed recipes for the next round. */
  hasProposals: boolean;
};

/** An existing component the answer can carry, chosen from the question's words. */
export type Embed =
  | { kind: "scatter"; input: string; target: string }
  | { kind: "order"; target: string }
  | { kind: "drivers" }
  | { kind: "recipes" };

const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, " ").trim();

/** The column names a question mentions, whole words only, matched as written or with underscores read as spaces. */
export function matchColumns(question: string, names: readonly string[]): string[] {
  const q = ` ${norm(question).replace(/[^\p{L}\p{N} ]+/gu, " ")} `;
  return names.filter((name) => {
    const n = norm(name).replace(/[^\p{L}\p{N} ]+/gu, " ");
    return n.length > 0 && q.includes(` ${n} `);
  });
}

const ASKS_DRIVERS = /\b(which|what) (input|setting|column)s? (matter|move|count|go|went)|\bmatters? most\b|\bgo(es)? with\b|\bwent with\b|\bmoves? the\b|\bwhat (affects|changes)\b/i;
const ASKS_RECIPES = /\b(run next|next round|proposed|propose|recipes? to run|what should i run|which recipes?)\b/i;
const ASKS_PLOT = /\b(show|plot|chart|graph|draw|see|by|against|versus|vs)\b/i;

/**
 * The one thing to draw under an answer, or null. A question naming an
 * input and the target (or an input alone) gets the target against that
 * input; the target alone gets it in sheet order; "which input matters most"
 * gets the inputs ranked; "what should I run next" gets the proposed recipes.
 */
export function embedFor(question: string, ctx: EmbedContext): Embed | null {
  const inputs = matchColumns(question, ctx.inputs);
  const namesTarget = ctx.target != null && matchColumns(question, [ctx.target]).length > 0;
  if (ctx.target && inputs.length > 0) return { kind: "scatter", input: inputs[0], target: ctx.target };
  if (ctx.target && namesTarget && ASKS_PLOT.test(question)) return { kind: "order", target: ctx.target };
  if (ctx.hasDrivers && ASKS_DRIVERS.test(question)) return { kind: "drivers" };
  if (ctx.hasProposals && ASKS_RECIPES.test(question)) return { kind: "recipes" };
  if (ctx.target && namesTarget) return { kind: "order", target: ctx.target };
  return null;
}

/** The full page an answer belongs to: the chart's page, the step's page, or the first source's page. */
export function fullPageFor(args: { question: string; answer: AssistAnswer | null; embed: Embed | null; next: AssistNext | null; sheetSha: string | null }): { href: string; label: string } {
  const { question, answer, embed, next, sheetSha } = args;
  if (embed?.kind === "scatter" || embed?.kind === "order") {
    return sheetSha ? { href: `/data/sheet/${sheetSha}`, label: "See the full page: your sheet" } : { href: "/data", label: "See the full page: Data" };
  }
  if (embed?.kind === "drivers") return { href: "/campaign/learn", label: "See the full page: Learn" };
  if (embed?.kind === "recipes") return { href: "/campaign/plan", label: "See the full page: Plan" };
  if (/\b(trust|reliable|rely|refus|why can'?t|not yet)\b/i.test(question)) return { href: "/campaign/learn", label: "See the full page: Learn" };
  if (/\b(since last round|last round|changed|changes|previous round)\b/i.test(question)) return { href: "/campaign/learn", label: "See the full page: Learn" };
  if (/\b(run next|next step|what should i (do|run))\b/i.test(question) && next) {
    const stage = next.action_route.split("/").pop() ?? "";
    return { href: next.action_route, label: `See the full page: ${stage.charAt(0).toUpperCase()}${stage.slice(1)}` };
  }
  for (const s of answer?.sources ?? []) {
    const href = sourceHref(s);
    if (href) return { href, label: `See the full page: ${s.kind === "sheet" ? "your sheet" : s.kind === "round" ? "the round" : "Learn"}` };
  }
  return { href: "/experiments", label: "See the full pages" };
}

export type PromptState = {
  next: AssistNext | null;
  target: string | null;
  /** The input the model ranked first, when it ranked any. */
  topInput: string | null;
  trusted: boolean | null;
  /** The round people see (1-based), or null before any analysis. */
  round: number | null;
  hasBestRun: boolean;
  hasProposals: boolean;
};

/** Up to five questions worth asking right now, worked out from the campaign's state. */
export function starterPrompts(s: PromptState): string[] {
  const out: string[] = ["What should I run next?"];
  const state = nextState(s.next);
  if (s.trusted === false || state === "not_trusted" || state === "fit_refused") out.push("Why can't you trust the model yet?");
  if (s.topInput) out.push("Which input matters most?");
  if (s.round != null && s.round >= 2) out.push("What changed since last round?");
  if (s.target && s.topInput) out.push(`Show me ${s.target} by ${s.topInput}`);
  if (s.hasBestRun) out.push("Why is the best run best?");
  if (s.hasProposals && !out.includes("What should I run next?")) out.push("What should I run next?");
  return out.slice(0, 5);
}
