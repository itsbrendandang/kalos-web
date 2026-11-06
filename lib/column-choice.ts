// The one decision on Setup, made in the browser BEFORE anything is sent to Kalos: which column is the
// target, which columns are inputs, and what every other column is. Everything here is read from the
// dropped file (components/campaign/data/profile.ts); nothing is a model output. The user's choice is
// sent to Kalos as explicit roles, so what was ticked is what the model uses. Tested in
// __tests__/column-choice.test.ts.

import { isRowNumberLike, summarize, type ColumnProfile, type SheetProfile } from "@/components/campaign/data/profile";
import type { ColumnRolesInput } from "@/lib/api";

/** Text inputs with more levels than this have too few runs per label to learn from, so they start unticked. */
export const MAX_INPUT_LEVELS = 10;

/** Column names that usually hold a measured result (Kalos's own name check, minus "conc": a concentration is usually something the lab set), so they start unticked. */
const RESULT_LIKE = /titer|titre|yield|purity|lipase|biomass|od\d|product|response|output|score|kda|activity/i;
/** Names Kalos prefers as the target when several columns look like results. */
const TARGET_PREFERRED = /titer|titre|lipase|yield/i;
/** Names that are run labels, dates or notes, never settings. */
const LABEL_LIKE = /^(id|name|sample(?:[ _.-]?(?:ids?|codes?|names?|no|num|number|ref|label|uuid))?|well|index|run|experiment|round|date|time|notes?)$/i;

export type ColumnUse = "target" | "input" | "left-out";

export type ColumnChoice = {
  name: string;
  /** What the column is, in the lab's words: "numbers, 12 to 48", "a choice of 3 labels", "run labels". */
  what: string;
  /** How it starts: the suggested target, an input, or left out. */
  suggested: ColumnUse;
  /** Why it starts left out (null for inputs and the target). */
  reason: string | null;
  /** True when ticking it is allowed at all (a column with no values or one value cannot be an input). */
  canBeInput: boolean;
  /** True when it could be chosen as the target (a numeric column that varies). */
  canBeTarget: boolean;
  /** A text column that is used as a choice between its labels. */
  categorical: boolean;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A number column whose values barely move (range under 1% of the typical value). A two-level input
 * (30 and 32 °C in every run) is NOT this: it is a setting the lab chose, so it starts ticked.
 */
export function barelyChanges(c: ColumnProfile): boolean {
  if (c.kind !== "numeric") return false;
  const s = summarize(c.numbers.filter((x): x is number => x != null));
  return s != null && s.max > s.min && (s.max - s.min) / Math.max(Math.abs(s.median), 1e-9) < 0.01;
}

function range(c: ColumnProfile): string {
  const v = c.numbers.filter((x): x is number => x != null);
  if (v.length === 0) return "";
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const f = (x: number) => (Number.isInteger(x) ? String(x) : String(Number(x.toPrecision(4))));
  return lo === hi ? `always ${f(lo)}` : `${f(lo)} to ${f(hi)}`;
}

/** What one column holds, in one phrase. */
export function describeColumn(c: ColumnProfile, n: number): string {
  if (c.kind === "empty") return "no values";
  const blank = c.missing > 0 ? `, blank in ${plural(c.missing, "run")}` : "";
  if (c.kind === "numeric") {
    if (isRowNumberLike(c, n)) return `row numbers 1 to ${n}`;
    return `numbers, ${range(c)}${blank}`;
  }
  if (c.kind === "category") return `a choice of ${plural(c.levels.length, "label")}: ${c.levels.map((l) => l.value).join(", ")}${blank}`;
  return `text that differs in ${c.distinct === c.filled ? "every run" : `${c.distinct} of ${c.filled} runs`}${blank}`;
}

/**
 * The column Kalos would most likely be asked to raise: a numeric column whose name says titer or yield,
 * else any result-like name, else the last numeric column that varies. Null when no numeric column varies.
 */
export function guessTarget(profile: SheetProfile): string | null {
  const numeric = profile.columns.filter((c) => c.kind === "numeric" && c.distinct > 1 && !barelyChanges(c) && !isRowNumberLike(c, profile.n));
  if (numeric.length === 0) return null;
  const preferred = numeric.find((c) => TARGET_PREFERRED.test(c.name));
  if (preferred) return preferred.name;
  const resultLike = numeric.filter((c) => RESULT_LIKE.test(c.name));
  if (resultLike.length) return resultLike[resultLike.length - 1].name;
  return numeric[numeric.length - 1].name;
}

/** Every column with what it is and how it should start, for the chosen target. */
export function describeColumns(profile: SheetProfile, target: string | null): ColumnChoice[] {
  const n = profile.n;
  return profile.columns.map((c): ColumnChoice => {
    const what = describeColumn(c, n);
    const base = { name: c.name, what, categorical: c.kind === "category" };
    const varies = c.kind !== "empty" && c.distinct > 1;
    const canBeTarget = c.kind === "numeric" && varies && !barelyChanges(c) && !isRowNumberLike(c, n);
    if (c.name === target) return { ...base, suggested: "target", reason: null, canBeInput: false, canBeTarget: true };
    const leftOut = (reason: string, canBeInput = varies): ColumnChoice => ({ ...base, suggested: "left-out", reason, canBeInput, canBeTarget });
    if (c.kind === "empty") return leftOut("no values", false);
    if (!varies) return leftOut("the same in every run", false);
    if (c.headerless) return leftOut("no header, so it cannot be named");
    if (c.kind === "numeric" && isRowNumberLike(c, n)) return leftOut("counts the rows");
    if (c.kind === "text") return leftOut("differs in nearly every run, like a label or a note");
    if (LABEL_LIKE.test(c.name.trim())) return leftOut("named like a run label or date");
    if (c.kind === "category" && c.levels.length > MAX_INPUT_LEVELS) return leftOut(`${c.levels.length} different labels: too few runs per label to learn from`);
    if (c.kind === "numeric" && RESULT_LIKE.test(c.name)) return leftOut("looks like a measured result, not a setting");
    if (barelyChanges(c)) return leftOut("barely changes across the runs");
    if (c.missing > n / 2) return leftOut("mostly blank");
    return { ...base, suggested: "input", reason: null, canBeInput: true, canBeTarget };
  });
}

/** The roles to send to Kalos: the target, the ticked inputs, and which of those are text choices. */
export function rolesFor(choices: readonly ColumnChoice[], target: string, inputs: ReadonlySet<string>): ColumnRolesInput {
  const features = choices.filter((c) => c.name !== target && inputs.has(c.name)).map((c) => c.name);
  const categoricals = choices.filter((c) => features.includes(c.name) && c.categorical).map((c) => c.name);
  return categoricals.length ? { target, features, categoricals } : { target, features };
}

/** The inputs that start ticked for a target. */
export function defaultInputs(choices: readonly ColumnChoice[]): Set<string> {
  return new Set(choices.filter((c) => c.suggested === "input").map((c) => c.name));
}

/** "Build the model with these 4 inputs" / disabled reasons, in one place. */
export function buildLabel(inputCount: number, rebuilt: boolean): string {
  const verb = rebuilt ? "Build the model again" : "Build the model";
  return `${verb} with ${inputCount === 1 ? "this input" : `these ${inputCount} inputs`}`;
}
