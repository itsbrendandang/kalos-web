// Client for the Kalos engine's Scale-Up Readout (POST /api/scale/readout -
// see kalos/docs/SCALE_READOUT.md). Reuses the same same-origin proxy base
// URL as lib/api.ts. No React here on purpose - every helper below is
// unit-testable without a DOM (see __tests__/scale-readout.test.ts).
import { API } from "@/lib/api";

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
 * union - never thrown for an EXPECTED HTTP outcome (200/400/401/403/422/503),
 * only for a genuine transport failure (caught below and folded into
 * "unavailable" so callers never need a try/catch of their own).
 */
export type ReadoutResult =
  | { kind: "html"; html: string }
  | { kind: "gate"; failedCheck: string; detail: string }
  | { kind: "busy"; retryAfterSeconds: number | null }
  | { kind: "auth" }
  | { kind: "upload"; message: string }
  | { kind: "unavailable"; message: string };

async function readJsonSafely<T>(r: Response): Promise<T | null> {
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** Posts the run sheet + target JSON to the engine and maps every documented
 *  response (kalos/docs/SCALE_READOUT.md) onto `ReadoutResult`. */
export async function runScaleReadout(file: File, target: ReadoutTarget): Promise<ReadoutResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("target", JSON.stringify(target));

  let r: Response;
  try {
    r = await fetch(`${API}/api/scale/readout`, { method: "POST", body: fd });
  } catch {
    return { kind: "unavailable", message: "The scale-up readout service is unreachable. Try again in a moment." };
  }

  if (r.status === 200) {
    return { kind: "html", html: await r.text() };
  }
  if (r.status === 422) {
    const body = await readJsonSafely<{ failed_check?: string; detail?: string }>(r);
    return {
      kind: "gate",
      failedCheck: body?.failed_check ?? "invalid_target",
      detail: body?.detail ?? "The engine rejected this sheet or target.",
    };
  }
  if (r.status === 503) {
    const header = r.headers.get("retry-after");
    const parsed = header ? Number(header) : NaN;
    return { kind: "busy", retryAfterSeconds: Number.isFinite(parsed) ? parsed : null };
  }
  if (r.status === 401 || r.status === 403) {
    return { kind: "auth" };
  }
  if (r.status === 400) {
    const body = await readJsonSafely<{ error?: string }>(r);
    return { kind: "upload", message: body?.error ?? "The upload was rejected." };
  }
  return { kind: "unavailable", message: `The engine responded ${r.status}.` };
}
