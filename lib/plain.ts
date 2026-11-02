/*
 * Plain-language wording for the Overview, so a research associate and a PhD can
 * read the same page. Each sentence restates a number the engine already gave;
 * it never adds a claim. Tested in __tests__/plain.test.ts.
 */
import type { Driver, ReliabilityVerdict } from "@/lib/api";

export type Trust = { level: "good" | "warn" | "none"; word: string; sentence: string; gloss: string };

/** The one trust verdict (lib/api reliabilityVerdict) in plain words. Wording never contradicts the engine's own label or reason. */
export function trustPlain(v: ReliabilityVerdict): Trust {
  if (v.state === "reliable") return { level: "good", word: v.label, sentence: v.reason, gloss: "In plain terms: the model has ordered unseen runs well enough that its suggestions are worth running. Still check each result." };
  if (v.state === "insufficient") return { level: "none", word: v.label, sentence: v.reason, gloss: "In plain terms: treat suggestions as ideas to try, not predictions." };
  return { level: "warn", word: v.label, sentence: v.reason, gloss: "In plain terms: treat suggestions as ideas to try, and add more runs before leaning on them." };
}

export type DriverLine = { name: string; sentence: string; clear: boolean; up: boolean };

const SHAPE: Record<string, (at: number | null) => string | null> = {
  interior_optimum: (at) => (at != null ? `Best near ${Number(at.toPrecision(4))}; too much or too little is worse.` : "Has a sweet spot in the middle."),
  monotonic_up: () => "More is better across the range tested.",
  monotonic_down: () => "Less is better across the range tested.",
  flat: () => "Little effect in this data.",
  interior_minimum: () => "Worst in the middle.",
};

/** One sentence per driver: which way it pulls the result, how sure, and where it peaks if the engine found a sweet spot. */
export function driverLine(d: Driver, target: string, shape?: { shape: string; optimum_at: number | null } | null): DriverLine {
  const up = d.rho >= 0;
  const clear = d.significant;
  const dir = up ? `Runs with more ${d.name} tended to have higher ${target}.` : `Runs with more ${d.name} tended to have lower ${target}.`;
  if (!clear && shape?.shape === "flat") return { name: d.name, sentence: `No clear effect on ${target} in this data.`, clear, up };
  const sure = clear ? "A clear signal." : "Not a clear signal yet, could be chance.";
  const extra = shape ? SHAPE[shape.shape]?.(shape.optimum_at) : null;
  return { name: d.name, sentence: `${dir} ${sure}${extra ? ` ${extra}` : ""}`, clear, up };
}
