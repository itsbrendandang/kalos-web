// Client for the Kalos engine's Scale-Up Readout (POST /api/scale/readout -
// see kalos/docs/SCALE_READOUT.md). Reuses the same same-origin proxy base
// URL as lib/api.ts. No React here on purpose - every helper below is
// unit-testable without a DOM (see __tests__/scale-readout.test.ts).
import { API, mutationHeaders } from "@/lib/api";
import { engineMessage } from "@/lib/engine-error";

/** Thrown by `buildReadoutTarget` on a bad or incomplete form - the message
 *  is written to be shown directly to the scientist filling out the form. */
export class ReadoutTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadoutTargetError";
  }
}

/**
 * The exact JSON shape the `target` form field expects - see
 * kalos/kalos/portal/scale_routes.py `_parse_target`. `agitation_rpm` and
 * `airflow_L_per_min` are present only when the uploaded sheet records both
 * columns; the engine chooses the physics vs. scale_only feature set from
 * the SHEET's own columns, never from this JSON, so omitting them here when
 * the sheet lacks them is what selects the scale-only model.
 */
export type ReadoutTarget = {
  scale_L: number;
  target_column: string;
  process_params: Record<string, number>;
  agitation_rpm?: number;
  airflow_L_per_min?: number;
  physics_overrides?: Record<string, number>;
};

/**
 * True when the run sheet's own header records both `agitation_rpm` and
 * `airflow_L_per_min` - the engine's own rule (kalos/docs/SCALE_READOUT.md
 * "Scale-only fallback") for choosing the physics feature set. Both columns
 * are required together: recording only one gives the model nothing it can
 * use either.
 */
export function hasPhysicsColumns(header: string[]): boolean {
  return header.includes("agitation_rpm") && header.includes("airflow_L_per_min");
}

/**
 * Parses just the header row out of a CSV/TSV file's raw text - handles a
 * leading UTF-8 BOM, CRLF or LF line endings, and RFC-4180 quoted fields
 * (commas and escaped `""` quotes inside a quoted header name). Delimiter is
 * inferred from the header line itself: TSV when it contains no comma but at
 * least one tab, comma otherwise (the common case, including a comma-only
 * single-column header).
 */
export function parseCsvHeader(text: string): string[] {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const newlineIndex = withoutBom.search(/\r\n|\r|\n/);
  const firstLine = newlineIndex === -1 ? withoutBom : withoutBom.slice(0, newlineIndex);
  const delimiter = !firstLine.includes(",") && firstLine.includes("\t") ? "\t" : ",";
  return splitDelimitedLine(firstLine, delimiter).map((h) => h.trim());
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Inputs collected from the scale-readout form, before validation. */
export type BuildReadoutTargetInput = {
  /** The uploaded sheet's header (or, for an XLSX sheet with no in-browser
   *  parser, the column names the user typed in manually). */
  header: string[];
  targetColumn: string;
  scaleL: number;
  /** Planned value at the target scale, keyed by process column name. */
  processParams: Record<string, number>;
  /** Required (and validated) only when `hasPhysicsColumns(header)`. */
  agitationRpm?: number | null;
  airflowLPerMin?: number | null;
};

/**
 * Builds the exact `target` JSON the engine expects, or throws a
 * `ReadoutTargetError` naming what is missing or invalid. Agitation/airflow
 * are included only when the sheet's header has both columns (matching the
 * engine's own scale-only fallback rule) - supplying them for a sheet that
 * lacks the columns would be accepted but ignored server-side, so the client
 * never sends them in that case.
 */
export function buildReadoutTarget(input: BuildReadoutTargetInput): ReadoutTarget {
  const { header, targetColumn, scaleL, processParams } = input;

  if (!targetColumn.trim()) {
    throw new ReadoutTargetError("Choose a target column.");
  }
  if (!Number.isFinite(scaleL) || scaleL <= 0) {
    throw new ReadoutTargetError("Target scale (L) must be a positive number.");
  }

  const processEntries = Object.entries(processParams);
  if (processEntries.length === 0) {
    throw new ReadoutTargetError("Select at least one process column and give it a planned value.");
  }
  for (const [column, value] of processEntries) {
    if (!Number.isFinite(value)) {
      throw new ReadoutTargetError(`"${column}" needs a numeric planned value.`);
    }
  }

  const target: ReadoutTarget = {
    scale_L: scaleL,
    target_column: targetColumn,
    process_params: { ...processParams },
  };

  if (hasPhysicsColumns(header)) {
    const { agitationRpm, airflowLPerMin } = input;
    const missing: string[] = [];
    if (agitationRpm == null || !Number.isFinite(agitationRpm)) missing.push("agitation (rpm)");
    if (airflowLPerMin == null || !Number.isFinite(airflowLPerMin)) missing.push("airflow (L/min)");
    if (missing.length > 0) {
      throw new ReadoutTargetError(
        `This sheet records agitation and airflow, so ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} required.`,
      );
    }
    target.agitation_rpm = agitationRpm as number;
    target.airflow_L_per_min = airflowLPerMin as number;
  }

  return target;
}

/**
 * Every outcome `POST /api/scale/readout` can produce, as a discriminated
 * union - never thrown for an EXPECTED HTTP outcome, only for a genuine
 * transport failure (caught below and folded into "unavailable" so callers
 * never need a try/catch of their own). Messages are plain sentences from
 * lib/engine-error.ts; raw codes are never shown.
 */
export type ReadoutResult =
  | { kind: "html"; html: string }
  | { kind: "gate"; failedCheck: string; detail: string }
  | { kind: "busy"; retryAfterSeconds: number | null }
  | { kind: "auth"; message: string; signIn: boolean }
  | { kind: "upload"; message: string }
  | { kind: "unavailable"; message: string };

async function readJsonSafely(r: Response): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await r.json();
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

const FORBIDDEN_COPY: Record<string, string> = {
  insufficient_scope: "Your account can read campaigns but not run analyses, which a readout needs. Ask an organization admin for write access.",
  mfa_required: "Your organization requires two-step sign-in before running analyses. Set it up in Settings, then try again.",
  step_up_required: "Confirm your sign-in again, then run the readout.",
  organization_not_provisioned: "Your organization is not set up on the analysis service yet. Ask your administrator.",
};

/** Posts the run sheet + target JSON to the engine and maps every documented
 *  response (kalos-engine docs/SCALE_READOUT.md, plus the web proxy's own
 *  failures) onto `ReadoutResult`. */
export async function runScaleReadout(file: File, target: ReadoutTarget): Promise<ReadoutResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("target", JSON.stringify(target));

  let r: Response;
  try {
    r = await fetch(`${API}/api/scale/readout`, { method: "POST", body: fd, headers: mutationHeaders() });
  } catch {
    return { kind: "unavailable", message: engineMessage({ code: "engine_unreachable" }).message };
  }

  if (r.status === 200) {
    return { kind: "html", html: await r.text() };
  }
  const body = await readJsonSafely(r);
  const code = str(body?.code) ?? (str(body?.error) && /^[a-z][a-z0-9_]*$/.test(str(body?.error)!) ? str(body?.error) : undefined);
  const error = str(body?.error);
  const limitMb = typeof body?.limit_mb === "number" ? body.limit_mb : undefined;

  if (r.status === 422) {
    return {
      kind: "gate",
      failedCheck: str(body?.failed_check) ?? code ?? "invalid_target",
      detail: str(body?.detail) ?? error ?? "",
    };
  }
  if (r.status === 503 && code !== "engine_credentials_unavailable") {
    const header = r.headers.get("retry-after");
    const parsed = header ? Number(header) : NaN;
    return { kind: "busy", retryAfterSeconds: Number.isFinite(parsed) ? parsed : null };
  }
  if (r.status === 401) {
    return { kind: "auth", message: engineMessage({ code: "unauthenticated" }).message, signIn: true };
  }
  if (r.status === 403) {
    return {
      kind: "auth",
      message: (code && FORBIDDEN_COPY[code]) ?? "The analysis service did not accept this request for your account. Sign in again, or ask your organization admin.",
      signIn: false,
    };
  }
  if (r.status === 400 || r.status === 413) {
    return { kind: "upload", message: engineMessage({ code: code ?? (r.status === 413 ? "payload_too_large" : null), error, limitMb }).message };
  }
  const fallback = r.status === 429 ? "rate_limited" : r.status === 504 ? "engine_timeout" : r.status === 502 ? "engine_unreachable" : "engine_error";
  return { kind: "unavailable", message: engineMessage({ code: code ?? fallback }).message };
}

/* ---------------------------------------------------------------------------
 * Reading the engine's readout page.
 *
 * The engine answers with one self-contained HTML page (kalos-engine
 * kalos/portal/scale_routes.py `render_readout_html`). The page itself stays
 * the printable record; the app also reads its decision, prediction, ladder
 * and "What it would take" lines out of it so they can be shown in the app's
 * own type. Values are copied as the engine printed them (already rounded by
 * the engine), never recomputed. A field the page does not carry is null.
 * ------------------------------------------------------------------------ */

export type ReadoutDecision = "NUMBER" | "NUMBER_WITH_WARNING" | "REFUSAL";

export type ReadoutRung = {
  scale: string;
  stepRatio: string;
  n: string;
  mae: string;
  naiveMeanMae: string;
  naiveNnMae: string;
  beatsBoth: string;
};

export type ReadoutReason = { plain: string; raw: string };

/**
 * The engine's refusal and warning sentences (kalos-engine kalos/scale/readout.py
 * `decide`), each with plain wording. Numbers are copied from the engine's
 * sentence, never assumed. A sentence matching none of these is kept as the
 * engine wrote it.
 */
const REASON_TEMPLATES: { re: RegExp; plain: (m: RegExpExecArray) => string }[] = [
  {
    re: /only (\d+) pooled ladder residual\(s\); need at least (\d+)/g,
    plain: (m) => `Too few held-out runs to judge the model: ${m[1]} so far, and the engine needs at least ${m[2]}.`,
  },
  {
    re: /no rung with at least (\d+) runs, within ([\d.]+) decade\(s\) of the largest trained scale, beat both naive baselines to license a reference step ratio/g,
    plain: (m) =>
      `No tested scale with at least ${m[1]} runs, within ${m[2] === "1" ? "a factor of 10" : `${m[2]} decades`} of your largest scale, beat both naive baselines, so no backtested step can vouch for this one.`,
  },
  {
    re: /pooled ladder MAE does not beat both naive baselines/g,
    plain: () => "Across the whole backtest, the model did not beat both naive baselines.",
  },
  {
    re: /target ratio ([\d.]+x) exceeds (\d+)x the reference step ratio ([\d.]+x)/g,
    plain: (m) => `The step to the target (${m[1]}) is more than ${m[2]} times the largest step the backtest supports (${m[3]}).`,
  },
  {
    re: /process parameter\(s\) outside the trained range: ([^;]+)/g,
    plain: (m) => `Planned values outside the range run in your sheet: ${m[1].trim()}.`,
  },
];

/** Splits the engine's reasons (one string, or a "; "-joined refusal headline) into known sentences, in order. */
export function readReasons(joined: string): ReadoutReason[] {
  const found: { at: number; end: number; reason: ReadoutReason }[] = [];
  for (const t of REASON_TEMPLATES) {
    const re = new RegExp(t.re.source, "g");
    for (let m = re.exec(joined); m; m = re.exec(joined)) {
      found.push({ at: m.index, end: m.index + m[0].length, reason: { plain: t.plain(m), raw: m[0] } });
    }
  }
  found.sort((a, b) => a.at - b.at);
  const out: ReadoutReason[] = [];
  let cursor = 0;
  const leftover = (to: number) => {
    for (const piece of joined.slice(cursor, to).split(/;\s*/)) {
      const raw = piece.trim();
      if (raw) out.push({ plain: raw, raw });
    }
  };
  for (const f of found) {
    if (f.at < cursor) continue;
    leftover(f.at);
    out.push(f.reason);
    cursor = f.end;
  }
  leftover(joined.length);
  return out;
}

export type ReadoutSummary = {
  /** The engine's decision; null if the page carries no recognisable banner. */
  decision: ReadoutDecision | null;
  /** Why the engine refused, or what it warned about: plain wording plus the engine's own sentence. */
  reasons: ReadoutReason[];
  /** The neutral scale-only note (sheet lacks agitation/airflow), when present. */
  scaleOnlyNote: string | null;
  prediction: {
    label: string;
    value: string;
    intervalLabel: string;
    low: string | null;
    high: string | null;
    intervalRaw: string;
  } | null;
  rungs: ReadoutRung[];
  skippedRungs: string[];
  referenceRatio: string | null;
  requestedRatio: string | null;
  outOfRange: string | null;
  baseline: {
    modelMae: string | null;
    naiveMeanMae: string | null;
    naiveNnMae: string | null;
    beatsBoth: string | null;
    nResiduals: string | null;
  } | null;
  /** "What it would take": the engine's own data plan lines. */
  dataPlan: string[];
  generatedAt: string | null;
  engineVersion: string | null;
  alpha: string | null;
  uploadSha256: string | null;
};

const DECISIONS: ReadoutDecision[] = ["NUMBER", "NUMBER_WITH_WARNING", "REFUSAL"];
const BANNER_CLASS: Record<string, ReadoutDecision> = {
  "banner-number": "NUMBER",
  "banner-warning": "NUMBER_WITH_WARNING",
  "banner-refusal": "REFUSAL",
};

const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Reads a parsed readout page (`new DOMParser().parseFromString(html, "text/html")`,
 *  which runs no script and loads nothing). Never throws. */
export function parseReadoutDocument(doc: Document): ReadoutSummary {
  const banner = doc.querySelector(".banner");
  const machine = text(banner?.querySelector(".banner-machine"));
  let decision: ReadoutDecision | null = (DECISIONS as string[]).includes(machine) ? (machine as ReadoutDecision) : null;
  if (!decision && banner) {
    for (const cls of Array.from(banner.classList)) if (BANNER_CLASS[cls]) decision = BANNER_CLASS[cls];
  }
  const headline = text(banner?.querySelector(".banner-headline"));

  let reasons: ReadoutReason[] = [];
  if (decision === "REFUSAL") {
    const joined = headline.replace(/^No prediction:\s*/i, "");
    reasons = joined && joined !== "no reason given" ? readReasons(joined) : [];
  } else {
    reasons = Array.from(doc.querySelectorAll("ul.reasons li")).map(text).filter(Boolean).flatMap(readReasons);
  }

  // Key/value rows grouped by the h2 they sit under, in document order.
  const sections = new Map<string, { k: string; v: string }[]>();
  let current = "";
  let ladderTable: Element | null = null;
  for (const el of Array.from(doc.querySelectorAll("h2, .kv, table"))) {
    if (el.tagName === "H2") {
      current = text(el);
      continue;
    }
    if (el.tagName === "TABLE") {
      if (!ladderTable && current === "Backtest ladder" && !el.classList.contains("const-table")) ladderTable = el;
      continue;
    }
    const list = sections.get(current) ?? [];
    list.push({ k: text(el.querySelector(".k")), v: text(el.querySelector(".v")) });
    sections.set(current, list);
  }
  const kv = (section: string, match: (k: string) => boolean): { k: string; v: string } | null =>
    (sections.get(section) ?? []).find((row) => match(row.k)) ?? null;
  const val = (section: string, key: string): string | null => kv(section, (k) => k === key)?.v || null;

  let prediction: ReadoutSummary["prediction"] = null;
  const predicted = kv("Prediction", (k) => k.startsWith("Predicted"));
  const interval = kv("Prediction", (k) => k.startsWith("Interval"));
  if (predicted?.v) {
    const m = interval?.v.match(/^\[\s*([^,\]]+?)\s*,\s*([^\]]+?)\s*\]$/);
    prediction = {
      label: predicted.k,
      value: predicted.v,
      intervalLabel: interval?.k.match(/\(([^)]+)\)/)?.[1] ?? "approximate coverage",
      low: m?.[1] ?? null,
      high: m?.[2] ?? null,
      intervalRaw: interval?.v ?? "",
    };
  }

  const rungs: ReadoutRung[] = [];
  if (ladderTable) {
    const heads = Array.from(ladderTable.querySelectorAll("thead th")).map((th) => text(th).toLowerCase());
    const col = (name: string) => heads.indexOf(name);
    for (const tr of Array.from(ladderTable.querySelectorAll("tbody tr"))) {
      const cells = Array.from(tr.querySelectorAll("td")).map(text);
      const at = (name: string, fallback: number) => cells[col(name) >= 0 ? col(name) : fallback] ?? "";
      rungs.push({
        scale: at("scale", 0),
        stepRatio: at("step ratio", 1),
        n: at("n", 2),
        mae: at("mae", 3),
        naiveMeanMae: at("naive_mean mae", 4),
        naiveNnMae: at("naive_nn mae", 5),
        beatsBoth: at("beats both", 6),
      });
    }
  }

  const baselineSection = Array.from(sections.keys()).find((k) => k.startsWith("Baseline comparison"));
  const baseline = baselineSection
    ? {
        modelMae: val(baselineSection, "Model MAE"),
        naiveMeanMae: val(baselineSection, "naive_mean MAE"),
        naiveNnMae: val(baselineSection, "naive_nn MAE"),
        beatsBoth: val(baselineSection, "beats both baselines"),
        nResiduals: val(baselineSection, "pooled residuals (n)"),
      }
    : null;

  const outOfRangeLine = Array.from(doc.querySelectorAll("p.muted"))
    .map(text)
    .find((t) => t.startsWith("Out-of-range process parameter"));
  const timestamp = text(doc.querySelector(".timestamp")).replace(/^Generated\s*/i, "");

  return {
    decision,
    reasons,
    scaleOnlyNote: text(doc.querySelector(".note-info")) || null,
    prediction,
    rungs,
    skippedRungs: Array.from(doc.querySelectorAll("ul.skipped-reasons li")).map(text).filter(Boolean),
    referenceRatio: val("Step ratio", "Reference (backtested) ratio"),
    requestedRatio: val("Step ratio", "Requested (target) ratio"),
    outOfRange: outOfRangeLine ? outOfRangeLine.replace(/^[^:]*:\s*/, "") : null,
    baseline,
    dataPlan: Array.from(doc.querySelectorAll("ul.data-plan li")).map(text).filter(Boolean),
    generatedAt: timestamp || null,
    engineVersion: val("Provenance", "engine version"),
    alpha: val("Provenance", "alpha"),
    uploadSha256: val("Provenance", "raw upload SHA-256"),
  };
}

/* ---------------------------------------------------------------------------
 * A 422 from the gate, in plain words.
 *
 * The gate's checks and thresholds are the engine's (kalos-engine
 * kalos/scale/readout.py `gate`, docs/SCALE_READOUT.md "How the decision is
 * made"). Thresholds are read out of the engine's own detail sentence when it
 * carries them, so the copy never states a limit the engine did not send.
 * ------------------------------------------------------------------------ */

export type GateRefusal = {
  /** One plain sentence: what the engine refused and why. */
  statement: string;
  /** What data or input change would get past the check. */
  fix: string[];
};

export function gateRefusal(failedCheck: string, detail: string): GateRefusal {
  switch (failedCheck) {
    case "required_columns": {
      const names = detail.match(/\[(.*)\]/)?.[1]?.replace(/['"]/g, "").trim();
      return {
        statement: names ? `The sheet is missing a column the readout needs: ${names}.` : "The sheet is missing a column the readout needs.",
        fix: [
          "Add the missing column to the sheet, or choose a target and process columns the sheet records.",
          "Every run needs its vessel volume in a scale_L column.",
        ],
      };
    }
    case "min_distinct_scales": {
      const have = detail.match(/only (\d+) distinct/)?.[1];
      const more = detail.match(/need (\d+) more/)?.[1];
      const min = detail.match(/at least (\d+) distinct/)?.[1];
      return {
        statement: have
          ? `The sheet has runs at ${have} distinct scale${have === "1" ? "" : "s"}${min ? `; the readout needs at least ${min}` : ""} to test itself on a scale ladder.`
          : "The sheet has runs at too few distinct scales for the readout to test itself on a scale ladder.",
        fix: [more ? `Runs at ${more} more distinct scale${more === "1" ? "" : "s"}.` : "Runs at more distinct scales."],
      };
    }
    case "non_finite_dropped_fraction": {
      const share = detail.match(/\(([\d.]+%)\)/)?.[1];
      const cap = detail.match(/the ([\d.]+%) cap/)?.[1];
      return {
        statement: `Too many rows have a blank or non-numeric value in a column the readout uses${share ? ` (${share} of rows` : ""}${share && cap ? `, over the ${cap} limit)` : share ? ")" : ""}.`,
        fix: ["Fill in or remove rows with blank cells in the target, process and scale_L columns."],
      };
    }
    case "target_not_interpolation":
      return {
        statement: "The target scale is not larger than every scale in the sheet. The readout only predicts a scale you have not run yet.",
        fix: [
          "Choose a target scale larger than the largest scale_L in the sheet.",
          "For a scale you have already run, the measured runs are the evidence; use a campaign at that scale.",
        ],
      };
    case "target_ratio_hard_cap": {
      const ratio = detail.match(/ratio ([\d.]+x)/)?.[1];
      const cap = detail.match(/the ([\d.]+x) hard cap/)?.[1];
      return {
        statement: `The target is too far beyond the largest scale in the sheet${ratio ? ` (${ratio}` : ""}${ratio && cap ? `; the limit is ${cap})` : ratio ? ")" : ""}.`,
        fix: [
          cap ? `Choose a target at most ${cap} the largest scale in the sheet.` : "Choose a target closer to the largest scale in the sheet.",
          "Or run at a larger intermediate scale first, then read out from there.",
        ],
      };
    }
    case "invalid_target":
      return {
        statement: "The engine could not use these inputs with this sheet.",
        fix: ["Check that the target column, the process columns and their planned values match the sheet, and that every value is a number."],
      };
    default:
      return {
        statement: "The engine did not run the readout on this sheet.",
        fix: ["Check the sheet and the inputs against the engine's reason below."],
      };
  }
}

/* ---------------------------------------------------------------------------
 * Numbers out of the engine's printed readout (VIZ_SPEC 2.3, 7 R1).
 *
 * The readout is HTML only (engine request R1), so its numbers arrive as the
 * engine printed them. These read them back into numbers so the app can show
 * them through lib/num (volumes in SI units, step ratios as "3.3×", shared
 * decimals in a column). A string that does not parse stays null, and the
 * view then shows the engine's own text verbatim: nothing is guessed.
 * ------------------------------------------------------------------------ */

/** "0.126" -> 0.126; "1,204" -> 1204; anything else (including "n/a (...)") -> null. */
export function parseEngineNumber(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = s.trim().replace(/,/g, "").replace(/\u2212/g, "-");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

const VOLUME_UNIT: Record<string, number> = { l: 1, ml: 1e-3, "µl": 1e-6, "μl": 1e-6, ul: 1e-6 };

/** "10 L" -> 10, "250 mL" -> 0.25, "3 µL" -> 3e-6, "7500" -> 7500 (liters). Null when it is not a volume. */
export function parseLiters(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = s.trim().match(/^([-+]?[\d,]*\.?\d+(?:e[-+]?\d+)?)\s*([a-zA-Zµμ]+)?$/i);
  if (!m) return null;
  const v = parseEngineNumber(m[1]);
  if (v == null) return null;
  const unit = (m[2] ?? "L").toLowerCase();
  const factor = VOLUME_UNIT[unit];
  return factor == null ? null : v * factor;
}

/** "3.33x" / "3.33×" -> 3.33. Null for "n/a (...)" and anything else. */
export function parseRatio(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = s.trim().match(/^([\d,]*\.?\d+)\s*[x×]$/i);
  return m ? parseEngineNumber(m[1]) : null;
}

/** "Predicted titer_g_per_L at 7500 L" -> { subject: "titer_g_per_L", liters: 7500 }. */
export function predictionSubject(label: string): { subject: string; liters: number | null } {
  const rest = label.replace(/^Predicted\s*/, "");
  const m = rest.match(/^(.*?)\s+at\s+(.+)$/);
  if (!m) return { subject: rest, liters: null };
  return { subject: m[1], liters: parseLiters(m[2]) };
}
