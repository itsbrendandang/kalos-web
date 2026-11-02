/*
 * The process map: the whole workflow as a chain of steps. Pure data and rules,
 * tested in __tests__/process.test.ts. Everything here is the user's own input
 * (typed, or extracted from an SOP they supplied and then confirmed); nothing is
 * predicted. Stored on this device only.
 */

export type StepKind = "cell-line" | "seed" | "upstream" | "harvest" | "capture" | "polish" | "ufdf" | "fill-finish" | "other";
export type Owner = "in-house" | "cro" | "cdmo";

export type Param = {
  id: string;
  name: string;
  unit: string;
  low: number | null;
  high: number | null;
  /** Where it came from: typed by the user, or read from an SOP and confirmed. */
  source: "manual" | "sop";
};

export type StepData = { name: string; rows: number; target: string | null; added: number };

export type Step = {
  id: string;
  name: string;
  kind: StepKind;
  owner: Owner;
  partner: string;
  params: Param[];
  sop: { name: string; added: number } | null;
  data: StepData[];
};

export type ProcessMap = { name: string; steps: Step[] };

export const KIND_LABEL: Record<StepKind, string> = {
  "cell-line": "Cell line",
  seed: "Seed train",
  upstream: "Upstream",
  harvest: "Harvest",
  capture: "Capture",
  polish: "Polishing",
  ufdf: "UF/DF",
  "fill-finish": "Fill / finish",
  other: "Other",
};
export const OWNER_LABEL: Record<Owner, string> = { "in-house": "In-house", cro: "CRO", cdmo: "CDMO" };

let counter = 0;
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

const p = (name: string, unit: string, low: number, high: number): Param => ({ id: uid("p"), name, unit, low, high, source: "manual" });
const step = (name: string, kind: StepKind, params: Param[]): Step => ({ id: uid("s"), name, kind, owner: "in-house", partner: "", params, sop: null, data: [] });

/** A starter chain for a monoclonal antibody (indicative CHO platform values, docs/research-process-map.md; unverified). To be edited, never a recommendation. */
export function mabTemplate(): ProcessMap {
  return {
    name: "Monoclonal antibody process",
    steps: [
      step("Cell line", "cell-line", []),
      step("Seed train", "seed", [p("Seeding density", "1e6 cells/mL", 0.3, 0.5), p("Temperature", "°C", 36.5, 37), p("pH", "", 6.9, 7.2), p("Dissolved oxygen", "%", 30, 50)]),
      step("Production bioreactor", "upstream", [p("pH", "", 6.8, 7.2), p("Temperature", "°C", 30, 37), p("Dissolved oxygen", "%", 30, 60), p("Glucose", "g/L", 2, 6), p("Osmolality", "mOsm/kg", 300, 450)]),
      step("Harvest", "harvest", []),
      step("Protein A capture", "capture", [p("Load", "g/L resin", 30, 60), p("Residence time", "min", 2, 6), p("Elution pH", "", 3.0, 3.6)]),
      step("Viral inactivation", "other", [p("Hold pH", "", 3.4, 3.6), p("Hold time", "min", 55, 65)]),
      step("Polishing", "polish", []),
      step("Viral filtration", "other", []),
      step("UF/DF", "ufdf", [p("Concentration", "g/L", 50, 100), p("TMP", "psi", 15, 25), p("Diavolumes", "DV", 7, 10)]),
      step("Fill / finish", "fill-finish", [p("Formulation pH", "", 5.5, 6.5), p("Polysorbate 80", "%", 0.01, 0.04)]),
    ],
  };
}

export type Extracted = { name: string; unit: string; low: number | null; high: number | null; line: string };

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;
const UNIT = String.raw`(°\s?[CF]|%|g\/L|mg\/mL|mS\/cm|mL\/h|rpm|g|min|h|hours?|L|mL|mM|mOsm\/kg|mOsm|kDa|psi|bar|vvm)?`;
const RANGE = new RegExp(String.raw`^\s*(?:[-•*\d.)]+\s*)?([A-Za-z][A-Za-z0-9 /()%_-]{1,40}?)\s*[:=]?\s*(?:of\s+)?${NUM}\s*(?:-|–|—|to)\s*${NUM}\s*${UNIT}`, "i");
const PLUSMINUS = new RegExp(String.raw`^\s*(?:[-•*\d.)]+\s*)?([A-Za-z][A-Za-z0-9 /()%_-]{1,40}?)\s*[:=]?\s*${NUM}\s*(?:±|\+\/-)\s*${NUM}\s*${UNIT}`, "i");
const SINGLE = new RegExp(String.raw`^\s*(?:[-•*\d.)]+\s*)?([A-Za-z][A-Za-z0-9 /()%_-]{1,40}?)\s*[:=]\s*${NUM}\s*${UNIT}\s*$`, "i");

const clean = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[:=-]+$/, "").trim();
const unitOf = (u: string | undefined) => (u ?? "").replace(/\s/g, "").replace(/^hours?$/i, "h");

/**
 * Pull candidate process parameters out of SOP text, one line at a time:
 * "pH 6.8 - 7.2", "Temperature: 36.5 ± 0.5 °C", "Agitation = 120 rpm".
 * This only proposes. A person confirms every line before it joins the map, and
 * lines it cannot read are left alone rather than guessed.
 */
export function extractParams(text: string): Extracted[] {
  const out: Extracted[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length > 160) continue;
    let m = line.match(PLUSMINUS);
    let hit: Extracted | null = null;
    if (m) {
      const c = Number(m[2]);
      const d = Math.abs(Number(m[3]));
      hit = { name: clean(m[1]), unit: unitOf(m[4]), low: round(c - d), high: round(c + d), line };
    } else if ((m = line.match(RANGE))) {
      const a = Number(m[2]);
      const b = Number(m[3]);
      hit = { name: clean(m[1]), unit: unitOf(m[4]), low: Math.min(a, b), high: Math.max(a, b), line };
    } else if ((m = line.match(SINGLE))) {
      const v = Number(m[2]);
      hit = { name: clean(m[1]), unit: unitOf(m[3]), low: v, high: v, line };
    }
    if (!hit || hit.name.length < 2 || /^(step|section|page|table|figure|version|rev|doc)\b/i.test(hit.name)) continue;
    const key = `${hit.name.toLowerCase()}|${hit.low}|${hit.high}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}
const round = (n: number) => Math.round(n * 1e6) / 1e6;

export type StepHealth = { state: "ready" | "needs-sop" | "needs-data" | "empty"; label: string };

/** One honest word about how much the map knows about a step. */
export function stepHealth(s: Step): StepHealth {
  if (!s.params.length && !s.sop && !s.data.length) return { state: "empty", label: "Nothing added yet" };
  if (!s.params.length) return { state: "needs-sop", label: "Add an SOP or parameters" };
  if (!s.data.length) return { state: "needs-data", label: "No data yet" };
  return { state: "ready", label: `${s.data.reduce((a, d) => a + d.rows, 0)} runs` };
}

export type MapSummary = { steps: number; params: number; withData: number; partners: string[] };
export function summarize(m: ProcessMap): MapSummary {
  return {
    steps: m.steps.length,
    params: m.steps.reduce((a, s) => a + s.params.length, 0),
    withData: m.steps.filter((s) => s.data.length).length,
    partners: [...new Set(m.steps.filter((s) => s.owner !== "in-house" && s.partner.trim()).map((s) => s.partner.trim()))],
  };
}

export const STORAGE_KEY = "kalos.processMap.v1";

/** Parse stored JSON defensively; anything malformed returns null so the app falls back to the template. */
export function parseStored(raw: string | null): ProcessMap | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as ProcessMap;
    if (!m || typeof m.name !== "string" || !Array.isArray(m.steps)) return null;
    return { name: m.name, steps: m.steps.filter((s) => s && typeof s.id === "string" && Array.isArray(s.params) && Array.isArray(s.data)) };
  } catch {
    return null;
  }
}

export type SheetSummary = { columns: string[]; rows: number };

/** Read just the header and row count of a CSV/TSV, on this device, without sending it anywhere. */
export function sheetSummary(text: string): SheetSummary | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const delim = (lines[0].match(/\t/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? "\t" : ",";
  const columns = splitRow(lines[0], delim).map((c) => c.trim()).filter(Boolean);
  return columns.length ? { columns, rows: lines.length - 1 } : null;
}
function splitRow(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** Which of a step's parameters have a column in the sheet, matched on name alone (case and punctuation ignored, or one name inside the other). */
export function matchColumns(params: readonly Param[], columns: readonly string[]): { matched: { param: Param; column: string }[]; unmatchedColumns: string[] } {
  const used = new Set<string>();
  const matched: { param: Param; column: string }[] = [];
  for (const param of params) {
    const n = norm(param.name);
    const col = columns.find((c) => !used.has(c) && (norm(c) === n || (n.length >= 3 && norm(c).includes(n))));
    if (col) {
      used.add(col);
      matched.push({ param, column: col });
    }
  }
  return { matched, unmatchedColumns: columns.filter((c) => !used.has(c)) };
}
