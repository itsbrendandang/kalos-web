// The tiny query language behind the local-graph lens's Filters field and its
// coloured Groups (DESIGN_SPEC.md 5.3, sections "Filters" and "Groups").
//
// The spec's own examples are `titer > 5.5`, `titer >= 6.0`, `status: failed`
// and `round: 4`, so the grammar is exactly one comparison: FIELD OP VALUE.
// There is no boolean algebra here and none is wanted - a group is a colour
// on a canvas, not a query builder.
//
// THE HONESTY RULE THIS MODULE EXISTS FOR.
// `status: failed` has no engine backing whatsoever: kalos records no failure
// status for a run, anywhere. A query over a field the data does not carry
// must NOT quietly evaluate to "0 matches", because zero matches reads as
// "there are no failed runs" - a claim about the campaign - when the true
// statement is "this campaign cannot answer that question at all". So field
// resolution reports three outcomes, not two: matched, not matched, and
// FIELD NOT CARRIED. The third is surfaced verbatim in the UI.
//
// The check is data-driven rather than a blocklist of known-missing fields: a
// field is backed when at least one node in the graph yields a value for it.
// The day kalos starts reporting run status, `status: failed` starts working
// with no change here.
import type { LineageGraph, MapNode } from "../map-types";

export type QueryOp = ">=" | "<=" | ">" | "<" | "=";

export type ParsedQuery = { field: string; op: QueryOp; value: string };

const OP_PATTERN = /(>=|<=|==|=|:|>|<)/;

/** `titer >= 6.0` -> `{ field: "titer", op: ">=", value: "6.0" }`.
 *  `:` and `==` both normalise to `=`. Returns null when the text is not a
 *  single FIELD OP VALUE comparison. */
export function parseQuery(raw: string): ParsedQuery | null {
  const text = raw.trim();
  if (text === "") return null;
  const match = OP_PATTERN.exec(text);
  if (!match || match.index === 0) return null;
  // The field keeps its typed case: recipe keys are engine column names like
  // `glucose_gL`, and lower-casing here would stop them ever matching.
  const field = text.slice(0, match.index).trim();
  const value = text.slice(match.index + match[0].length).trim();
  if (field === "" || value === "") return null;
  const raw_op = match[0];
  const op: QueryOp = raw_op === ":" || raw_op === "==" ? "=" : (raw_op as QueryOp);
  return { field, op, value };
}

/** Aliases for a node's measured objective value.
 *
 *  Deliberately MEASURED only. A proposal carries `pred`, the surrogate's
 *  prediction, in the same `value` slot - and a group called `titer >= 6.0`
 *  that lit up six proposals would be colouring predictions as if they were
 *  measurements, which is the single most misleading thing this surface could
 *  do. Proposals therefore resolve to undefined for these fields, and a
 *  campaign whose only values are predictions correctly reports the field as
 *  not carried. */
const VALUE_FIELDS = new Set(["titer", "value", "result", "objective"]);

/** The value a node offers for a field name, or undefined when it carries
 *  none. `undefined` is the whole point: it is what distinguishes "this run
 *  does not qualify" from "no run has this attribute". */
export function fieldValue(node: MapNode, field: string): number | string | undefined {
  const key = field.toLowerCase();
  if (key === "round") return node.round;
  if (key === "mode") return node.mode ?? undefined;
  if (key === "kind") return node.kind;
  if (VALUE_FIELDS.has(key)) {
    if (node.kind === "proposal") return undefined;
    return node.value ?? undefined;
  }
  if (!node.recipe) return undefined;
  if (field in node.recipe) return node.recipe[field];
  // Engine column names are mixed case (`glucose_gL`, `DO_pct`); a reader
  // typing them from memory should not have to match capitals exactly.
  const loose = Object.keys(node.recipe).find((k) => k.toLowerCase() === key);
  return loose == null ? undefined : node.recipe[loose];
}

function compare(actual: number | string, op: QueryOp, expected: string): boolean {
  const expectedNumber = Number(expected);
  if (typeof actual === "number" && Number.isFinite(expectedNumber)) {
    if (op === ">=") return actual >= expectedNumber;
    if (op === "<=") return actual <= expectedNumber;
    if (op === ">") return actual > expectedNumber;
    if (op === "<") return actual < expectedNumber;
    return actual === expectedNumber;
  }
  // Non-numeric comparisons only make sense for equality; ordering strings by
  // `<` would answer a question nobody asked.
  if (op !== "=") return false;
  return String(actual).toLowerCase() === expected.toLowerCase();
}

export type QueryResult =
  /** Empty input. Not an error - the filter simply does nothing. */
  | { kind: "empty" }
  /** Not a FIELD OP VALUE comparison. */
  | { kind: "unparsed"; reason: string }
  /** Parsed fine, but nothing in this campaign carries the field, so the
   *  query can never match anything. Distinct from a real zero. */
  | { kind: "unbacked"; field: string; reason: string }
  | { kind: "ok"; ids: Set<string>; count: number };

/** True when at least one node in the graph carries the field at all. */
export function fieldIsCarried(graph: LineageGraph, field: string): boolean {
  return graph.nodes.some((n) => fieldValue(n, field) !== undefined);
}

export function evaluateQuery(graph: LineageGraph, raw: string): QueryResult {
  if (raw.trim() === "") return { kind: "empty" };
  const parsed = parseQuery(raw);
  if (!parsed) {
    return {
      kind: "unparsed",
      reason: "Write one comparison, like titer >= 6.0 or round: 4.",
    };
  }
  if (!fieldIsCarried(graph, parsed.field)) {
    return {
      kind: "unbacked",
      field: parsed.field,
      reason: `Nothing in this campaign carries a ${parsed.field}, so this can never match. That is not the same as zero runs qualifying.`,
    };
  }
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    const actual = fieldValue(node, parsed.field);
    if (actual === undefined) continue;
    if (compare(actual, parsed.op, parsed.value)) ids.add(node.id);
  }
  return { kind: "ok", ids, count: ids.size };
}
