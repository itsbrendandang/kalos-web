/*
 * Plain-language wording for the Overview, so a research associate and a PhD can
 * read the same page. Each sentence restates a number the engine already gave;
 * it never adds a claim. Tested in __tests__/plain.test.ts.
 */
import type { Driver, ReliabilityVerdict } from "@/lib/api";

export type Trust = { level: "good" | "fair" | "weak" | "none"; word: string; sentence: string };

export function trustPlain(v: ReliabilityVerdict): Trust {
  const rho = v.rho;
  if (v.state === "insufficient" || rho == null) return { level: "none", word: "Not enough data yet", sentence: "There are too few runs to check how well the model predicts. Treat its suggestions as ideas to try, not predictions." };
  if (v.state === "reliable" && rho >= 0.7) return { level: "good", word: "Good", sentence: "On runs it had not seen, the model ordered results close to how they really came out. Its suggestions are worth running." };
  if (v.state === "reliable") return { level: "fair", word: "Fair", sentence: "On runs it had not seen, the model's ordering matched reality moderately well. Worth trying, but expect surprises." };
  return { level: "weak", word: "Weak", sentence: "On runs it had not seen, the model did not order results reliably. Treat suggestions as hunches and add more runs before leaning on them." };
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
