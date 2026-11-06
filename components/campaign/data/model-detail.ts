// plain-words: disclosure-only
// The technical reading of the model's checks, in the engine's own terms, for the disclosures of "The model".
// Every sentence here is rendered one click down, under a plain sentence that says what it means.
import type { Calibration } from "@/lib/api";

/**
 * The technical reading behind `calibrationVerdict`, for a disclosure: the nearest-to-90% level's held-out
 * coverage against what it aims for, or Kalos's own reason when it could not check.
 */
export function calibrationLine(cal: Calibration | null | undefined): string {
  if (!cal) return "Kalos did not report whether its likely ranges held on held-out runs.";
  if (!cal.available || cal.levels.length === 0) return cal.reason ?? "Kalos could not check its likely ranges on held-out runs.";
  const level = cal.levels.reduce((best, l) => (Math.abs(l.nominal - 0.9) < Math.abs(best.nominal - 0.9) ? l : best), cal.levels[0]);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const width = cal.z_std == null ? "" : cal.z_std > 1.15 ? " The ranges look too narrow for the held-out errors." : cal.z_std < 0.85 ? " The ranges look wider than the held-out errors need." : " The ranges look about the right width.";
  return `Of held-out runs, ${pct(level.empirical)} fell inside the model's ${pct(level.nominal)} range, against the ${pct(level.nominal)} it aims for (z_std ${cal.z_std == null ? "not reported" : cal.z_std.toFixed(2)}).${width}`;
}
