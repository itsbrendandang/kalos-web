/*
 * C7 CalibrationPlot adapter (VIZ_SPEC 5, C7). Pure: the engine's
 * `reliability.calibration` (nominal vs held-out empirical coverage of the
 * model's own uncertainty bands, its ECE and z_std) -> a reliability diagram,
 * the Data table and the description. The z_std reading uses the shared
 * tolerance (`Z_STD_TOLERANCE` in lib/api.ts): within it the honest reading is
 * "close to calibrated", not a direction.
 *
 * The only arithmetic is min for the axis floor and recovering the inside
 * count (empirical x n), printed only when it is an integer to within the
 * engine's 4-decimal rounding.
 */
import type { DataTable } from "@/components/viz/frame";
import { Z_STD_TOLERANCE, type Calibration, type Diagnostics } from "@/lib/api";
import { formatValue } from "@/lib/num";
import { COARSE_CALIBRATION_N, MIN_CALIBRATION_LEVELS } from "@/lib/viz-thresholds";

/** `inside` = held-out runs inside this nominal band, of `n` (the series' own held-out count). */
export type CalLevel = { nominal: number; empirical: number; inside: number | null; n: number };

export type CalibrationData =
  | { state: "absent" }
  | { state: "not-scored"; reason: string }
  | {
      /** "table": fewer than MIN_CALIBRATION_LEVELS levels, shown as a table, not a chart. */
      state: "ready" | "table";
      levels: CalLevel[];
      n: number;
      ece: number | null;
      zStd: number | null;
      headline: string;
      reading: string | null;
      coarse: boolean;
      alt: { label: string; levels: CalLevel[] } | null;
      /** Identical x and y domain (coverage fraction), [floor, 1]. */
      domain: [number, number];
    };

export type CalibrationInput = {
  reliability?: { calibration?: Calibration | null } | null;
  alternative_scale?: Diagnostics["alternative_scale"] | null;
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The interval-calibration headline in plain words (shared with the Predict page's facts). */
export function calibrationHeadlineOf(cal: Calibration | null | undefined): string {
  if (!cal) return "Not reported";
  if (!cal.available) return "Not scored";
  if (cal.z_std == null) return "Scored";
  if (Math.abs(cal.z_std - 1) <= Z_STD_TOLERANCE) return "Close to calibrated";
  return cal.z_std > 1 ? "Bands read too narrow" : "Bands read too wide";
}

/** "z-spread 1.35: bands too narrow (overconfident)", with the same tolerance as the headline. */
export function zStdReading(zStd: number | null): string | null {
  if (!isNum(zStd)) return null;
  const z = formatValue(zStd, { quantity: "score" }).value;
  const shape = Math.abs(zStd - 1) <= Z_STD_TOLERANCE ? "close to calibrated" : zStd > 1 ? "bands too narrow (overconfident)" : "bands too wide (conservative)";
  return `z-spread ${z}: ${shape}`;
}

const levelsOf = (cal: Calibration): CalLevel[] =>
  (cal.levels ?? [])
    .filter((l) => isNum(l.nominal) && isNum(l.empirical))
    .map((l) => {
      const k = l.empirical * cal.n;
      const inside = isNum(cal.n) && cal.n > 0 && Math.abs(k - Math.round(k)) < 0.01 ? Math.round(k) : null;
      return { nominal: l.nominal, empirical: l.empirical, inside, n: cal.n };
    })
    .sort((a, b) => a.nominal - b.nominal);

export function toCalibration(d: CalibrationInput): CalibrationData {
  const cal = d.reliability?.calibration;
  if (!cal) return { state: "absent" };
  if (!cal.available) return { state: "not-scored", reason: cal.reason ?? "not enough held-out points with a usable model uncertainty" };
  const levels = levelsOf(cal);
  const altCal = d.alternative_scale?.calibration;
  const alt = altCal && altCal.available && altCal.levels?.length ? { label: `${d.alternative_scale?.scale ?? "alternative"} scale`, levels: levelsOf(altCal) } : null;
  const vals = [...levels, ...(alt?.levels ?? [])].flatMap((l) => [l.nominal, l.empirical]);
  const floor = vals.length ? Math.max(0, Math.floor((Math.min(...vals) - 0.05) * 10) / 10) : 0;
  return {
    state: levels.length < MIN_CALIBRATION_LEVELS ? "table" : "ready",
    levels,
    n: cal.n,
    ece: isNum(cal.ece) ? cal.ece : null,
    zStd: isNum(cal.z_std) ? cal.z_std : null,
    headline: calibrationHeadlineOf(cal),
    reading: zStdReading(cal.z_std),
    coarse: isNum(cal.n) && cal.n < COARSE_CALIBRATION_N,
    alt,
    domain: [floor, 1],
  };
}

/** "74% inside (122 of 165)": the percentage with its count whenever the count is exact. */
export function levelText(l: CalLevel): string {
  const pct = formatValue(l.empirical, { quantity: "pct" }).text;
  return l.inside != null ? `${pct} inside (${formatValue(l.inside, { quantity: "count" }).text} of ${formatValue(l.n, { quantity: "count" }).text})` : `${pct} inside`;
}

export function describeCalibration(c: CalibrationData): string {
  if (c.state === "absent") return "";
  if (c.state === "not-scored") return `Interval calibration not scored: ${c.reason}`;
  const parts = [`Interval calibration on ${formatValue(c.n, { quantity: "count" }).text} held-out runs: ${c.headline}.`];
  for (const l of c.levels) parts.push(`${formatValue(l.nominal, { quantity: "pct" }).text} nominal band: ${levelText(l)}.`);
  if (c.ece != null) parts.push(`ECE ${formatValue(c.ece, { quantity: "score" }).value}.`);
  if (c.reading) parts.push(`${c.reading}.`);
  return parts.join(" ");
}

export function calibrationTable(c: CalibrationData): DataTable | null {
  if (c.state !== "ready" && c.state !== "table") return null;
  const row = (series: string, l: CalLevel) => [
    series,
    formatValue(l.nominal, { quantity: "pct" }).text,
    formatValue(l.empirical, { quantity: "pct" }).text,
    l.inside != null ? `${formatValue(l.inside, { quantity: "count" }).text} of ${formatValue(l.n, { quantity: "count" }).text}` : "n/a",
  ];
  return {
    columns: ["Series", "Nominal coverage", "Held-out coverage", "Inside"],
    rows: [...c.levels.map((l) => row("Model", l)), ...(c.alt?.levels.map((l) => row(c.alt!.label, l)) ?? [])],
  };
}
