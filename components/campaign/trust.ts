/*
 * The one trust verdict a page shows. The engine's own `verdict` wins when it
 * sent one (engine AGENTS.md: the engine decides, the web displays); older
 * engines fall back to the web's derived reliabilityVerdict. Pure, tested in
 * __tests__/trust.test.ts.
 */

import type { Tone } from "@/components/kit/tone";
import { reliabilityVerdict, type AnalyzeResult, type EngineVerdict } from "@/lib/api";

export type TrustView = {
  tone: Tone;
  /** Short label, e.g. "Reliable". */
  label: string;
  /** The one sentence shown first. */
  sentence: string;
  /** Further plain reasons, shown one click down. */
  details: string[];
  source: "engine" | "derived";
};

const LABEL: Record<EngineVerdict["state"], string> = { reliable: "Reliable", not_yet: "Not yet reliable", refused: "Not enough to propose" };
const TONE: Record<EngineVerdict["state"], Tone> = { reliable: "good", not_yet: "warn", refused: "bad" };

export function trustView(d: Pick<AnalyzeResult, "verdict" | "reliability" | "cv_ci95" | "cv_spearman">): TrustView {
  const v = d.verdict;
  if (v && v.state in LABEL && typeof v.headline === "string") {
    const details = [...(v.reasons ?? []).map((r) => r.plain), v.ordering?.plain, v.range_width?.plain].filter(
      (t): t is string => typeof t === "string" && t.length > 0 && t !== v.headline,
    );
    return { tone: TONE[v.state], label: LABEL[v.state], sentence: v.headline, details: [...new Set(details)], source: "engine" };
  }
  const r = reliabilityVerdict(d);
  return {
    tone: r.state === "reliable" ? "good" : r.state === "not-yet" ? "warn" : "neutral",
    label: r.label,
    sentence: r.reason,
    details: [],
    source: "derived",
  };
}
