/*
 * Seed data for the plate analysis surface (96-well QC + growth-curve dashboard).
 *
 * This is a deterministic, seeded simulation of a nitrogen-source screen
 * (PID-107, E. coli), ported from the plate-analysis mockup. Kalos does not
 * yet expose a plate-reader / QC API, so this screen renders from this
 * module. Types are shaped so a real API (well reads, per-well metrics,
 * flags, control stats) can drop in later without touching the plate/*
 * components - swap `generatePlate` for a fetch that returns `PlateSummary`.
 *
 * Everything here is illustrative demo data, not a real experiment.
 */

// --- RNG: mulberry32 (seeded, deterministic) ---------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Plate + condition setup --------------------------------------------------

export const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export type Row = (typeof ROWS)[number];
export const COLS = Array.from({ length: 12 }, (_, i) => i + 1);

interface NitrogenSource {
  name: string;
  quality: number;
}

const SOURCES: NitrogenSource[] = [
  { name: "Yeast extract", quality: 1.0 },
  { name: "Casein peptone", quality: 0.9 },
  { name: "Soy peptone", quality: 0.72 },
  { name: "Glutamine", quality: 0.6 },
  { name: "Urea", quality: 0.45 },
  { name: "Ammonium sulfate", quality: 0.5 },
];
const DOSES = [5, 10, 20, 40]; // g/L

function doseFactor(dose: number): number {
  const optimal = 20;
  const width = 16;
  return Math.exp(-((dose - optimal) ** 2) / (2 * width * width));
}

export type ControlType = "positive" | "negative";
export type WellStatus = "pass" | "warn" | "fail";
export type FlagCategory = "Growth" | "Spatial" | "Control" | "Environment";

export interface WellFlag {
  cat: FlagCategory;
  label: string;
}

export interface GompertzParams {
  od0: number;
  a: number;
  mu: number;
  lag: number;
}

export interface WellMetrics {
  /** Delta OD, max - t0. The value the heatmap is colored by. */
  deltaOD: number;
  maxOD: number;
  /** Gompertz growth rate mu, 1/h. */
  growthRate: number;
  /** Gompertz lag time, h. */
  lag: number;
  /** Significant-growth time (first hour crossing t0 + 0.05), h. */
  sgt: number;
  sgtReached: boolean;
  /** Trapezoidal AUC of delta-OD over 0-24h. */
  auc: number;
}

export interface Well {
  id: string;
  row: Row;
  col: number;
  rowIdx: number;
  isControl: boolean;
  controlType?: ControlType;
  /** Human-readable condition, e.g. "Urea · 20 g/L" or "MRS positive control". */
  condition: string;
  source: string;
  dose?: number;
  quality?: number;
  pairId: string;
  replicate: "A" | "B";
  pairWith: string;
  /** Hourly OD reads, 0-24h (25 points), including read noise. */
  curve: number[];
  metrics: WellMetrics;
  /** Pass/Warn/Fail terciles by deltaOD, only scored for experimental wells. */
  status: WellStatus | null;
  flags: WellFlag[];
}

export interface PlateSummary {
  wells: Record<string, Well>;
  /** All 96 well ids, row-major (A1..A12, B1..B12, ... H1..H12). */
  wellIds: string[];
  expIds: string[];
  controlIds: string[];
  posControlIds: string[];
  negControlIds: string[];
  passCount: number;
  warnCount: number;
  failCount: number;
  duplicatePairCount: number;
  flagCatCounts: Record<FlagCategory, number>;
  flaggedWellCount: number;
  /** Z' = 1 - 3(sigma+ + sigma-) / |mu+ - mu-|, from the 12 pos / 12 neg control wells. */
  zPrime: number;
  /** Positive-control coefficient of variation, percent. */
  controlCV: number;
  posMean: number;
  negMean: number;
  deltaMin: number;
  deltaMax: number;
  defaultWellId: string;
  /** Shared Gompertz base params per replicate pair, used to draw the fit line. */
  pairBase: Record<string, GompertzParams>;
}

/** Hourly time axis for growth curves, 0-24h. */
export const HOURS = Array.from({ length: 25 }, (_, i) => i);

/** Gompertz growth curve: OD(t) = OD0 + A * exp( -exp( (mu*e/A)*(lag - t) + 1 ) ). Exported for the fit line. */
export function gompertz(t: number, p: GompertzParams): number {
  return p.od0 + p.a * Math.exp(-Math.exp(((p.mu * Math.E) / p.a) * (p.lag - t) + 1));
}

function mean(a: number[]): number {
  return a.reduce((x, y) => x + y, 0) / a.length;
}
function sd(a: number[]): number {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1));
}
function percentile(sorted: number[], p: number): number {
  return sorted[Math.floor(p * (sorted.length - 1))];
}

/** Builds one deterministic, seeded 96-well plate. Pure function of `seed`. */
export function generatePlate(seed: number): PlateSummary {
  const rng = mulberry32(seed);

  // --- wells scaffold ---
  const wellIds: string[] = [];
  const wells: Record<string, Well> = {};
  ROWS.forEach((r, rowIdx) => {
    COLS.forEach((c) => {
      const id = `${r}${c}`;
      wellIds.push(id);
      wells[id] = {
        id,
        row: r,
        col: c,
        rowIdx,
        isControl: false,
        condition: "",
        source: "",
        pairId: "",
        replicate: "A",
        pairWith: "",
        curve: [],
        metrics: { deltaOD: 0, maxOD: 0, growthRate: 0, lag: 0, sgt: 0, sgtReached: false, auc: 0 },
        status: null,
        flags: [],
      };
    });
  });
  function isEdge(w: Well): boolean {
    return w.row === "A" || w.row === "H" || w.col === 1 || w.col === 12;
  }

  // --- controls: col 1 & 12 (all rows) + row A/H cols 2-5 => 24 wells ---
  const controlIdSet = new Set<string>();
  ROWS.forEach((r) => {
    controlIdSet.add(`${r}1`);
    controlIdSet.add(`${r}12`);
  });
  [2, 3, 4, 5].forEach((c) => {
    controlIdSet.add(`A${c}`);
    controlIdSet.add(`H${c}`);
  });
  const controlIds = Array.from(controlIdSet);
  const shuffledControls = shuffle(controlIds, rng);
  shuffledControls.forEach((id, i) => {
    const w = wells[id];
    w.isControl = true;
    w.controlType = i % 2 === 0 ? "positive" : "negative";
  });
  const posControlIds = controlIds.filter((id) => wells[id].controlType === "positive");
  const negControlIds = controlIds.filter((id) => wells[id].controlType === "negative");

  // --- experimental wells: remaining 72, grouped into 36 duplicate pairs ---
  const expIds = wellIds.filter((id) => !wells[id].isControl);
  const combos: { source: string; quality: number; dose: number }[] = [];
  SOURCES.forEach((s) => DOSES.forEach((d) => combos.push({ source: s.name, quality: s.quality, dose: d })));
  const shuffledExp = shuffle(expIds, rng);
  const expPairs: [string, string][] = [];
  for (let i = 0; i < shuffledExp.length; i += 2) expPairs.push([shuffledExp[i], shuffledExp[i + 1]]);
  expPairs.forEach((pair, i) => {
    const combo = combos[i % combos.length];
    const pairId = `EP${i + 1}`;
    pair.forEach((id, rep) => {
      const w = wells[id];
      w.condition = `${combo.source} · ${combo.dose} g/L`;
      w.source = combo.source;
      w.dose = combo.dose;
      w.quality = combo.quality;
      w.pairId = pairId;
      w.replicate = rep === 0 ? "A" : "B";
      w.pairWith = pair[1 - rep];
    });
  });

  // --- pair up controls too (so every well has a duplicate partner for the chart) ---
  function pairUp(ids: string[], prefix: string) {
    const sh = shuffle(ids, rng);
    for (let i = 0; i < sh.length; i += 2) {
      const pairId = `${prefix}${i / 2 + 1}`;
      [sh[i], sh[i + 1]].forEach((id, rep) => {
        const w = wells[id];
        w.pairId = pairId;
        w.replicate = rep === 0 ? "A" : "B";
        w.pairWith = sh[i + (1 - rep)];
      });
    }
  }
  pairUp(posControlIds, "CP+");
  pairUp(negControlIds, "CP-");
  posControlIds.forEach((id) => {
    wells[id].condition = "MRS positive control";
    wells[id].source = "MRS (+)";
  });
  negControlIds.forEach((id) => {
    wells[id].condition = "Blank / no-N control";
    wells[id].source = "No-N blank";
  });

  // --- Gompertz growth model: OD(t) = OD0 + A * exp( -exp( (mu*e/A)*(lag - t) + 1 ) ) ---
  function jitter() {
    return rng() - 0.5;
  }
  function gompertzParams(w: Well): GompertzParams {
    const od0 = 0.06 + 0.01 * jitter();
    if (w.isControl && w.controlType === "positive") {
      return { od0, a: 0.95 + 0.4 * jitter(), mu: 0.42 + 0.1 * jitter(), lag: 2.0 + 0.4 * jitter() };
    }
    if (w.isControl && w.controlType === "negative") {
      return { od0, a: 0.05 + 0.09 * Math.abs(jitter()), mu: 0.02 + 0.01 * Math.abs(jitter()), lag: 8 + 2 * jitter() };
    }
    const q = w.quality ?? 0;
    const df = doseFactor(w.dose ?? 0);
    const a = Math.max(0.03, 0.95 * q * df + 0.1 * jitter());
    const mu = Math.max(0.03, 0.15 + 0.35 * q * df + 0.04 * jitter());
    const lag = Math.max(0.5, 6 - 4 * q * df + 0.8 * jitter());
    return { od0, a, mu, lag };
  }
  function perturb(base: GompertzParams): GompertzParams {
    const j = () => (rng() - 0.5) * 0.12;
    return {
      od0: base.od0 * (1 + j()),
      a: Math.max(0.02, base.a * (1 + j())),
      mu: Math.max(0.02, base.mu * (1 + j())),
      lag: Math.max(0.3, base.lag * (1 + j())),
    };
  }

  const pairBase: Record<string, GompertzParams> = {};
  wellIds.forEach((id) => {
    const w = wells[id];
    if (!pairBase[w.pairId]) pairBase[w.pairId] = gompertzParams(w);
  });
  wellIds.forEach((id) => {
    const w = wells[id];
    const params = perturb(pairBase[w.pairId]);
    w.curve = HOURS.map((t) => gompertz(t, params) + (rng() - 0.5) * 0.01);
  });

  // --- derived metrics ---
  function computeMetrics(curve: number[]): WellMetrics {
    const t0 = curve[0];
    const maxOD = Math.max(...curve);
    const deltaOD = maxOD - t0;
    const thresh = t0 + 0.05;
    let sgt: number | null = null;
    for (let i = 0; i < curve.length; i++) {
      if (curve[i] >= thresh) {
        sgt = HOURS[i];
        break;
      }
    }
    const sgtReached = sgt !== null;
    const sgtValue = sgtReached ? (sgt as number) : 24;
    let auc = 0;
    for (let i = 1; i < curve.length; i++) {
      const y0 = curve[i - 1] - t0;
      const y1 = curve[i] - t0;
      auc += ((y0 + y1) / 2) * (HOURS[i] - HOURS[i - 1]);
    }
    // growthRate/lag are filled in by the caller from the well's own Gompertz params.
    return { deltaOD, maxOD, growthRate: 0, lag: 0, sgt: sgtValue, sgtReached, auc };
  }
  wellIds.forEach((id) => {
    const w = wells[id];
    const base = pairBase[w.pairId];
    w.metrics = { ...computeMetrics(w.curve), growthRate: base.mu, lag: base.lag };
  });

  // --- status: Pass/Warn/Fail via deltaOD terciles (experimental wells only) ---
  const expDeltasSorted = expIds
    .map((id) => wells[id].metrics.deltaOD)
    .slice()
    .sort((a, b) => a - b);
  const t33 = percentile(expDeltasSorted, 0.3333);
  const t66 = percentile(expDeltasSorted, 0.6667);
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  expIds.forEach((id) => {
    const d = wells[id].metrics.deltaOD;
    const status: WellStatus = d <= t33 ? "fail" : d <= t66 ? "warn" : "pass";
    wells[id].status = status;
    if (status === "pass") passCount++;
    else if (status === "warn") warnCount++;
    else failCount++;
  });

  // --- flags: Growth / Spatial / Control / Environment ---
  wellIds.forEach((id) => {
    const w = wells[id];
    if (isEdge(w)) w.flags.push({ cat: "Spatial", label: "Edge well (row/column boundary)" });
    if (w.isControl) {
      w.flags.push({
        cat: "Control",
        label: w.controlType === "positive" ? "Positive control (MRS)" : "Negative control (blank)",
      });
    }
  });
  const sortedExpByDelta = expIds.slice().sort((a, b) => wells[a].metrics.deltaOD - wells[b].metrics.deltaOD);
  const nExp = sortedExpByDelta.length;
  const veryLowCut = Math.floor(nExp * 0.12);
  const lowCut = Math.floor(nExp * 0.32);
  const highCut = Math.floor(nExp * 0.78);
  sortedExpByDelta.forEach((id, i) => {
    const w = wells[id];
    if (i < veryLowCut) w.flags.push({ cat: "Growth", label: "Very low ΔOD" });
    else if (i < lowCut) w.flags.push({ cat: "Growth", label: "Low ΔOD" });
    else if (i >= highCut) w.flags.push({ cat: "Growth", label: "High ΔOD (outlier growth)" });
  });
  wellIds.forEach((id) => {
    if (rng() < 0.35) wells[id].flags.push({ cat: "Environment", label: "Incubator position drift (sim.)" });
  });

  const flagCatCounts: Record<FlagCategory, number> = { Growth: 0, Spatial: 0, Control: 0, Environment: 0 };
  let flaggedWellCount = 0;
  wellIds.forEach((id) => {
    const w = wells[id];
    if (w.flags.length > 0) flaggedWellCount++;
    const seen = new Set<FlagCategory>();
    w.flags.forEach((f) => {
      if (!seen.has(f.cat)) {
        flagCatCounts[f.cat]++;
        seen.add(f.cat);
      }
    });
  });

  // --- control summary + Z' ---
  const posDeltas = posControlIds.map((id) => wells[id].metrics.deltaOD);
  const negDeltas = negControlIds.map((id) => wells[id].metrics.deltaOD);
  const posMean = mean(posDeltas);
  const posSD = sd(posDeltas);
  const negMean = mean(negDeltas);
  const negSD = sd(negDeltas);
  const zPrime = 1 - (3 * (posSD + negSD)) / Math.abs(posMean - negMean);
  const controlCV = (posSD / posMean) * 100;

  const allDeltas = wellIds.map((id) => wells[id].metrics.deltaOD);
  const deltaMin = Math.min(...allDeltas);
  const deltaMax = Math.max(...allDeltas);

  // --- default selection: a clean pass-status Yeast extract x 40 g/L well if present ---
  let defaultWellId = expIds.find((id) => {
    const w = wells[id];
    return w.source === "Yeast extract" && w.dose === 40 && w.status === "pass";
  });
  if (!defaultWellId) defaultWellId = expIds.find((id) => wells[id].status === "pass") ?? expIds[0];

  return {
    wells,
    wellIds,
    expIds,
    controlIds,
    posControlIds,
    negControlIds,
    passCount,
    warnCount,
    failCount,
    duplicatePairCount: expPairs.length,
    flagCatCounts,
    flaggedWellCount,
    zPrime,
    controlCV,
    posMean,
    negMean,
    deltaMin,
    deltaMax,
    defaultWellId,
    pairBase,
  };
}

const SEED = 107107; // PID-107

/** The plate rendered by /plate - deterministic seed data, see the file comment. */
export const PLATE: PlateSummary = generatePlate(SEED);
