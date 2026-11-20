// Client for the Kalos engine's Scale-Up Readout, JSON variant
// (POST /api/scale/readout.json, engine request R1; ENGINE_API_V2.md section 1).
// The engine's JSON drives everything on the page: the decision, the
// prediction and its interval, the ladder evidence and the chart. Nothing is
// read out of HTML and nothing is recomputed. Reuses the same-origin proxy base
// URL as lib/api.ts. No React here on purpose - every helper below is
// unit-testable without a DOM (see __tests__/scale-readout.test.ts).
import { API, mutationHeaders } from "@/lib/api";
import { engineMessage } from "@/lib/engine-error";

export type ReadoutDecision = "NUMBER" | "NUMBER_WITH_WARNING" | "REFUSAL";

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

/* ---------------------------------------------------------------------------
 * The JSON readout (ENGINE_API_V2.md section 1). Types mirror the engine's
 * dict; every field the engine may omit on another build is optional, and a
 * missing field renders nothing (never 0).
 * ------------------------------------------------------------------------ */

export type ReadoutRung = {
  scale_L: number;
  step_ratio: number | null;
  n: number;
  mae: number | null;
  naive_mean_mae: number | null;
  naive_nn_mae: number | null;
  beats_both: boolean | null;
  too_few_to_judge: boolean;
  in_license_window?: boolean;
  /** backtest.per_scale only. */
  measured_mean?: number | null;
  backtest_pred_mean?: number | null;
};

export type SkippedRung = { scale_L: number; reason: string };

export type ScalePoint = { scale_L: number; actual: number; oof_pred: number | null; basis?: string; oof_pred_basis?: string | null };

export type DivergenceCode = "did_not_beat_baselines" | "outside_backtest_band" | (string & {});

export type DivergencePerScale = {
  scale_L: number;
  n: number;
  measured_mean: number | null;
  backtest_pred_mean: number | null;
  band_half_width: number | null;
  band_basis?: string | null;
  n_prior_residuals?: number;
  outside_band: boolean | null;
  band_unavailable_reason: string | null;
  beats_both: boolean | null;
  too_few_to_judge: boolean;
  diverges: boolean;
  codes: DivergenceCode[];
};

export type ScaleReadout = {
  kind: "scale_readout";
  schema_version: number;
  /** SHA-256 over engine version, sheet bytes and canonical target: stable, so a gate decision can link to it. */
  readout_id: string;
  generated_at_utc: string | null;
  target_column: string;
  target_column_unit: string | null;
  decision: ReadoutDecision;
  reasons: string[];
  prediction: number | null;
  prediction_basis?: string | null;
  interval: [number, number] | null;
  interval_half_width?: number | null;
  /** Engine-reported coverage of the interval (0.9), null on a refusal. */
  interval_coverage: number | null;
  interval_method: string | null;
  /** The engine's own label for the interval ("approximate 90% coverage ..."); printed as sent. */
  interval_label: string;
  rungs: ReadoutRung[];
  skipped_rungs: SkippedRung[];
  reference_ratio: number | null;
  requested_ratio: number | null;
  out_of_range_params: string[];
  baseline_comparison: {
    pooled_mae: number | null;
    pooled_naive_mean_mae: number | null;
    pooled_naive_nn_mae: number | null;
    pooled_beats_both: boolean | null;
    n_residuals: number | null;
  } | null;
  /** "What would fix it": the engine's data plan lines, verbatim. */
  data_plan: string[];
  target_inputs: { scale_L: number; agitation_rpm?: number; airflow_L_per_min?: number; process_params?: Record<string, number> } & Record<string, unknown>;
  feature_set?: string;
  missing_physics_inputs?: string[];
  scale_points?: ScalePoint[] | null;
  backtest?: {
    method: string;
    method_description?: string;
    per_scale: ReadoutRung[];
    skipped?: SkippedRung[];
    pooled?: { mae: number | null; naive_mean_mae: number | null; naive_nn_mae: number | null; beats_both: boolean | null; n_residuals: number | null; too_few_to_judge?: boolean } | null;
  } | null;
  divergence?:
    | { computed: true; rule?: string; flags: { scale_L: number; codes: DivergenceCode[] }[]; per_scale: DivergencePerScale[] }
    | { computed: false; reason?: string; rule?: string }
    | null;
  max_trained_scale_L?: number | null;
  warn_ratio_mult?: number | null;
  refuse_ratio_mult?: number | null;
  hard_cap_ratio?: number | null;
  /** Derived only from engine constants; null when there is no reference ratio. */
  zones?: { licensed_max_L: number; warn_max_L: number; hard_cap_L: number; basis?: string; rule?: string } | null;
  provenance?: {
    engine_version?: string;
    kalos_git_sha?: string;
    raw_upload_sha256?: string;
    alpha?: number;
    seed?: number;
    constants?: Record<string, number | string>;
  } & Record<string, unknown>;
};

/**
 * Every outcome `POST /api/scale/readout.json` can produce, as a discriminated
 * union - never thrown for an EXPECTED HTTP outcome, only for a genuine
 * transport failure (caught below and folded into "unavailable" so callers
 * never need a try/catch of their own). A REFUSAL is a 200 readout, not an
 * error. Messages are plain sentences from lib/engine-error.ts; raw codes are
 * never shown.
 */
export type ReadoutResult =
  | { kind: "readout"; readout: ScaleReadout }
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

/** A 200 body is a readout only when the engine says so; anything else is treated as an engine error, never charted. */
export function isScaleReadout(v: unknown): v is ScaleReadout {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.kind === "scale_readout" &&
    typeof o.readout_id === "string" &&
    (o.decision === "NUMBER" || o.decision === "NUMBER_WITH_WARNING" || o.decision === "REFUSAL") &&
    Array.isArray(o.reasons) &&
    Array.isArray(o.rungs)
  );
}

const FORBIDDEN_COPY: Record<string, string> = {
  insufficient_scope: "Your account can read campaigns but not run analyses, which a readout needs. Ask an organization admin for write access.",
  mfa_required: "Your organization requires two-step sign-in before running analyses. Set it up in Settings, then try again.",
  step_up_required: "Confirm your sign-in again, then run the readout.",
  organization_not_provisioned: "Your organization is not set up on the analysis service yet. Ask your administrator.",
};

/** The JSON readout route through the same-origin proxy. */
export const READOUT_PATH = "/api/scale/readout.json";

/** Posts the run sheet + target JSON to the engine and maps every documented
 *  response (ENGINE_API_V2.md section 1, plus the web proxy's own failures)
 *  onto `ReadoutResult`. */
export async function runScaleReadout(file: File, target: ReadoutTarget): Promise<ReadoutResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("target", JSON.stringify(target));

  let r: Response;
  try {
    r = await fetch(`${API}${READOUT_PATH}`, { method: "POST", body: fd, headers: mutationHeaders({ Accept: "application/json" }) });
  } catch {
    return { kind: "unavailable", message: engineMessage({ code: "engine_unreachable" }).message };
  }

  const body = await readJsonSafely(r);
  if (r.status === 200) {
    return isScaleReadout(body)
      ? { kind: "readout", readout: body }
      : { kind: "unavailable", message: "The analysis service answered in a form this page cannot read. Nothing was charted. Try again in a moment." };
  }
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
 * The engine's reasons in plain words.
 *
 * The engine's refusal and warning sentences (kalos-engine kalos/scale/readout.py
 * `decide`) are shown in plain wording, with the engine's exact sentence one
 * click down. Numbers are copied from the engine's sentence, never assumed. A
 * sentence matching none of the templates is kept as the engine wrote it.
 * ------------------------------------------------------------------------ */

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
