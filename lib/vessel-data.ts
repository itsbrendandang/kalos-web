/*
 * Seed data for the vessel-analysis workspace (ambr CHO multi-vessel kinetics).
 *
 * This is a deterministic, seeded simulation of a 48-vessel ambr microreactor CHO
 * fed-batch run, ported from the vessel-workspace mockup. Kalos does not yet expose
 * a live ambr / bioreactor API, so this screen renders from this module. Types are
 * shaped so a real API (per-vessel kinetic reads, endpoints, qP) can drop in later
 * without touching the vessels/* components - swap `generateVessels` for a fetch
 * that returns `VesselWorkspace`.
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

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

/** Hourly-sampled time axis for the kinetic traces, 0-336h (14 days) in 24h steps. */
export const HOURS = Array.from({ length: 15 }, (_, i) => i * 24);

export type KineticChannel = "titer" | "via" | "vcd" | "lac" | "glu" | "ph";

export interface VesselSeries {
  /** TITER, g/L. */
  titer: number[];
  /** CELL_VIABILITY, %. */
  via: number[];
  /** VIABLE_CELL_DENSITY, x10^6/mL. */
  vcd: number[];
  /** Lactate, g/L. */
  lac: number[];
  /** Glucose, g/L. */
  glu: number[];
  /** pH (controlled, gentle drift). */
  ph: number[];
}

export interface VesselEndpoints {
  /** Final titer, g/L - matches `finalTiter` (the table + coloring value). */
  titer: number;
  /** Final viability, %. */
  via: number;
  /** Final VCD, x10^6/mL. */
  vcd: number;
  /** Peak lactate over the run, g/L (not the final read - lactate is consumed late-run). */
  lac: number;
  /** Final glucose (residual at harvest), g/L. */
  glu: number;
}

export interface Vessel {
  idx: number;
  cellLine: string;
  protein: string;
  /** Reactor/vessel id, e.g. "CS1-3". */
  vesselId: string;
  csi: string;
  system: string;
  medium: string;
  volumeMl: string;
  /** Specific productivity, pg/cell/day-ish. */
  qP: number;
  /** Final titer, g/L - the value the sequential color ramp keys off. */
  finalTiter: number;
  endpoints: VesselEndpoints;
  series: VesselSeries;
}

/** Units for each kinetic channel - shared across every vessel in a workspace, so a real API's
 *  payload can be typechecked against the same basis instead of silently mixing e.g. mg/L and g/L. */
export interface VesselUnits {
  titer: string;
  vcd: string;
  lactate: string;
  glucose: string;
  ph: string;
}

export interface VesselWorkspace {
  vessels: Vessel[];
  vesselIds: number[];
  titerMin: number;
  titerMax: number;
  /** The rows selected by default when the page mounts (mirrors the mockup's initial selection). */
  defaultSelectedIds: number[];
  units: VesselUnits;
}

/** Builds one deterministic, seeded ambr vessel workspace. Pure function of `seedBase`. */
export function generateVessels(seedBase: number, n = 48): VesselWorkspace {
  const vessels: Vessel[] = [];

  for (let i = 0; i < n; i++) {
    // Each vessel gets its own RNG instance, reseeded off the vessel index - this
    // matches the mockup's generator and keeps every vessel reproducible in isolation.
    const r = mulberry32(seedBase + i * 7);

    // qP and finalTiter are drawn from a shared latent "productivity" factor plus
    // INDEPENDENT per-vessel noise, not from one another - this keeps their correlation
    // emergent (typically ~0.6-0.8) instead of algebraic (finalTiter used to be a direct
    // scaled function of qP, which made the correlation scatter's R^2 circular/guaranteed).
    // Real qP and titer must come from independent measurement channels (specific
    // productivity assay vs. titer assay) so this same independence holds once a live
    // ambr/bioreactor API replaces this seed data.
    const productivity = r(); // shared latent factor, in [0, 1)
    const qP = clamp(8 + productivity * 22 + (r() - 0.5) * 14, 3, 34); // independent qP noise
    const finalTiter = Number(clamp(0.5 + productivity * 3.4 + (r() - 0.5) * 1.5, 0.1, 6).toFixed(3)); // independent titer noise
    const vcdPeak = 8 + r() * 16;
    const peakT = 168 + r() * 72;
    const viaEnd = 62 + r() * 26;
    const lacPeak = 2.2 + r() * 2.2;
    const gluc0 = 6 + r() * 1.2;
    const glucResid = 0.4 + r() * 1.9; // residual glucose at harvest, varies per vessel
    const phOffset = (r() - 0.5) * 0.14; // per-vessel controlled-pH offset

    const titer: number[] = [];
    const via: number[] = [];
    const vcd: number[] = [];
    const lac: number[] = [];
    const glu: number[] = [];
    const ph: number[] = [];

    HOURS.forEach((t) => {
      const growth = 1 / (1 + Math.exp(-(t - 96) / 40)); // growth logistic
      const decay = t > peakT ? Math.exp(-(t - peakT) / 120) : 1; // death phase
      const v = vcdPeak * growth * decay * (0.96 + r() * 0.08);
      vcd.push(Number(v.toFixed(2)));

      const titerS = 1 / (1 + Math.exp(-(t - 150) / 55));
      titer.push(Number((finalTiter * titerS).toFixed(3)));

      via.push(Number(clamp(98 - (98 - viaEnd) * Math.pow(t / 336, 1.8) + (r() - 0.5) * 2, 30, 99).toFixed(1)));
      lac.push(Number(clamp(lacPeak * Math.sin(Math.PI * clamp(t / 300, 0, 1)) * (0.9 + r() * 0.2), 0, 6).toFixed(2)));
      glu.push(
        Number(
          clamp(gluc0 - (gluc0 - glucResid) * (t / 336) + (t % 96 < 24 && t > 0 ? 0.5 : 0), 0.15, 7).toFixed(2),
        ),
      ); // feed bumps, varying residual
      ph.push(Number(clamp(7.14 - 0.1 * (t / 336) + phOffset + 0.02 * Math.sin(t / 60), 6.8, 7.3).toFixed(2))); // controlled, gentle drift
    });

    vessels.push({
      idx: i + 1,
      cellLine: "CU-" + (24070 + Math.floor(r() * 40)),
      protein: "PEB-" + (380 + Math.floor(r() * 20)),
      vesselId: "CS1-" + (1 + (i % 12)),
      csi: "CSI-" + (1 + (i % 6)),
      system: "ambr microreactor",
      medium: "CD CHO Medium",
      volumeMl: "7.20",
      qP: Number(qP.toFixed(2)),
      finalTiter,
      endpoints: {
        titer: finalTiter,
        via: via[via.length - 1],
        vcd: vcd[vcd.length - 1],
        lac: Number(Math.max(...lac).toFixed(2)),
        glu: glu[glu.length - 1],
      },
      series: { titer, via, vcd, lac, glu, ph },
    });
  }

  const titers = vessels.map((v) => v.finalTiter);
  const vesselIds = vessels.map((v) => v.idx);

  return {
    vessels,
    vesselIds,
    titerMin: Math.min(...titers),
    titerMax: Math.max(...titers),
    defaultSelectedIds: vesselIds.slice(0, 23),
    units: { titer: "g/L", vcd: "×10⁶ cells/mL", lactate: "g/L", glucose: "g/L", ph: "pH (unitless)" },
  };
}

/** OLS fit of y on x, plus R^2 - used for the titer-vs-qP correlation scatter. */
export interface LinearFit {
  slope: number;
  intercept: number;
  /** null when the fit is degenerate (see `degenerate`) - never NaN/Infinity. */
  r2: number | null;
  /** true when x or y has ~zero variance, so no meaningful line/R^2 can be fit. */
  degenerate: boolean;
}

export function linearRegression(xs: number[], ys: number[]): LinearFit {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const EPS = 1e-9;
  if (!Number.isFinite(sxx) || !Number.isFinite(syy) || sxx < EPS || syy < EPS) {
    return { slope: 0, intercept: my, r2: null, degenerate: true };
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2, degenerate: false };
}

const SEED = 480048; // ambr vessel workspace seed

/** The vessel workspace rendered by /vessels - deterministic seed data, see the file comment. */
export const VESSELS: VesselWorkspace = generateVessels(SEED);
