// Mock data for the Data room (app/data/page.tsx). This is the single source
// of truth for the dataset registry - it used to live inline in
// app/data/page.tsx as `export const DATASETS`, but moved here once the page
// grew a real drill-down (per-dataset sample runs, output ranges) that needed
// a second table (`RUNS_BY_DATASET`) to sit next to it.
//
// Deterministic STATIC data: no `Math.random()` at module scope and no
// `Date.now()`/`new Date()` anywhere, so server- and client-rendered HTML
// always match (no hydration warnings) and the registry doesn't silently
// drift as real time passes. Dates are baked as both a display label
// (`addedLabel`, e.g. "12 Apr 2026") and a plain ISO string (`addedSort`)
// used only for lexicographic sorting - no Date parsing involved.

/** One tracked measured output and its unit, for the output-ranges summary. */
export interface OutputSpec {
  name: string;
  unit?: string;
}

/** Known outputs across the registry, for looking up a unit by name. */
export const OUTPUT_SPECS: OutputSpec[] = [
  { name: "Titer_g_L", unit: "g/L" },
  { name: "Purity_pct", unit: "%" },
  { name: "Viability_pct", unit: "%" },
  { name: "VCD", unit: "1e6 cells/mL" },
  { name: "dOD600", unit: "OD" },
  { name: "Activity_U_mL", unit: "U/mL" },
  { name: "Yield_pct", unit: "%" },
  { name: "Clone_score", unit: "score" },
];

const OUTPUT_UNIT_BY_NAME = new Map(OUTPUT_SPECS.map((o) => [o.name, o.unit]));

export function outputUnit(name: string): string | undefined {
  return OUTPUT_UNIT_BY_NAME.get(name);
}

export interface DatasetRecord {
  /** Stable, content-derived dataset barcode. */
  barcode: string;
  name: string;
  runs: number;
  outputs: string[];
  features: number;
  rows: number;
  sizeLabel: string;
  /** Display date, e.g. "12 Apr 2026". */
  addedLabel: string;
  /** ISO yyyy-mm-dd twin of `addedLabel`, for deterministic string-sorting only. */
  addedSort: string;
  status: "active" | "archived";
  /** Irreversibly-hashed campaign/experiment key - identity is never stored. */
  campaignHash: string;
}

export const DATASETS: DatasetRecord[] = [
  {
    barcode: "KAL-DS-7F21A0",
    name: "media-doe-2406",
    runs: 538,
    outputs: ["Titer_g_L", "Purity_pct"],
    features: 12,
    rows: 538,
    sizeLabel: "18.2 MB",
    addedLabel: "12 Apr 2026",
    addedSort: "2026-04-12",
    status: "active",
    campaignHash: "c-9f2a1e",
  },
  {
    barcode: "KAL-DS-3C88E1",
    name: "cho-fedbatch-2405",
    runs: 48,
    outputs: ["Titer_g_L", "Viability_pct", "VCD"],
    features: 9,
    rows: 48,
    sizeLabel: "2.4 MB",
    addedLabel: "03 Mar 2026",
    addedSort: "2026-03-03",
    status: "active",
    campaignHash: "c-4b7c2d",
  },
  {
    barcode: "KAL-DS-9B04D7",
    name: "nsource-plate-2404",
    runs: 96,
    outputs: ["dOD600", "Purity_pct"],
    features: 6,
    rows: 96,
    sizeLabel: "1.1 MB",
    addedLabel: "14 Feb 2026",
    addedSort: "2026-02-14",
    status: "active",
    campaignHash: "c-1a8f90",
  },
  {
    barcode: "KAL-DS-A15C33",
    name: "ecoli-lipase-2403",
    runs: 180,
    outputs: ["Activity_U_mL", "Purity_pct"],
    features: 10,
    rows: 180,
    sizeLabel: "6.7 MB",
    addedLabel: "22 Jan 2026",
    addedSort: "2026-01-22",
    status: "archived",
    campaignHash: "c-77e2b1",
  },
  {
    barcode: "KAL-DS-E68204",
    name: "ambr-scaleup-2402",
    runs: 64,
    outputs: ["Titer_g_L", "Viability_pct"],
    features: 14,
    rows: 64,
    sizeLabel: "3.9 MB",
    addedLabel: "05 Dec 2025",
    addedSort: "2025-12-05",
    status: "active",
    campaignHash: "c-e0d4a3",
  },
  {
    barcode: "KAL-DS-5D9A17",
    name: "clone-screen-2401",
    runs: 312,
    outputs: ["Clone_score", "Yield_pct"],
    features: 7,
    rows: 312,
    sizeLabel: "9.8 MB",
    addedLabel: "18 Nov 2025",
    addedSort: "2025-11-18",
    status: "archived",
    campaignHash: "c-2f61c8",
  },
];

// Single source of truth for the KPI + registry caption, so they can never disagree.
export const TOTAL_RUNS = DATASETS.reduce((sum, d) => sum + d.runs, 0);
export const DATASET_COUNT = DATASETS.length;

/** One sample run: recipe inputs and measured outputs, keyed by the dataset's barcode. */
export interface RunRecord {
  barcode: string;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
}

/** A small (5-8 row) sample of runs per dataset, for the registry drill-down. */
export const RUNS_BY_DATASET: Record<string, RunRecord[]> = {
  "KAL-DS-7F21A0": [
    { barcode: "KAL-6A3F02", inputs: { Glycerol_pct: 2.0, Methanol_pct: 0.5, pH: 6.8, Temp_C: 30 }, outputs: { Titer_g_L: 1.8, Purity_pct: 92.1 } },
    { barcode: "KAL-91C4D8", inputs: { Glycerol_pct: 3.5, Methanol_pct: 1.0, pH: 7.0, Temp_C: 28 }, outputs: { Titer_g_L: 2.4, Purity_pct: 94.3 } },
    { barcode: "KAL-3E7B10", inputs: { Glycerol_pct: 1.0, Methanol_pct: 0.2, pH: 6.5, Temp_C: 32 }, outputs: { Titer_g_L: 1.1, Purity_pct: 88.7 } },
    { barcode: "KAL-F80A22", inputs: { Glycerol_pct: 4.0, Methanol_pct: 1.5, pH: 7.2, Temp_C: 29 }, outputs: { Titer_g_L: 2.9, Purity_pct: 95.6 } },
    { barcode: "KAL-2C619B", inputs: { Glycerol_pct: 2.5, Methanol_pct: 0.8, pH: 6.9, Temp_C: 30 }, outputs: { Titer_g_L: 2.1, Purity_pct: 91.4 } },
    { barcode: "KAL-7D4E33", inputs: { Glycerol_pct: 3.0, Methanol_pct: 1.2, pH: 7.1, Temp_C: 27 }, outputs: { Titer_g_L: 2.6, Purity_pct: 93.8 } },
  ],
  "KAL-DS-3C88E1": [
    { barcode: "KAL-B41A09", inputs: { Feed_rate_mL_h: 4.2, pH: 6.9, DO_pct: 40, Temp_C: 36.5 }, outputs: { Titer_g_L: 3.1, Viability_pct: 88.2, VCD: 14.6 } },
    { barcode: "KAL-08F73C", inputs: { Feed_rate_mL_h: 5.6, pH: 7.0, DO_pct: 45, Temp_C: 37.0 }, outputs: { Titer_g_L: 3.8, Viability_pct: 91.5, VCD: 16.2 } },
    { barcode: "KAL-C2D915", inputs: { Feed_rate_mL_h: 3.0, pH: 6.8, DO_pct: 35, Temp_C: 36.0 }, outputs: { Titer_g_L: 2.4, Viability_pct: 82.7, VCD: 11.9 } },
    { barcode: "KAL-5A6E80", inputs: { Feed_rate_mL_h: 6.4, pH: 7.1, DO_pct: 50, Temp_C: 37.2 }, outputs: { Titer_g_L: 4.2, Viability_pct: 93.1, VCD: 17.8 } },
    { barcode: "KAL-E97B21", inputs: { Feed_rate_mL_h: 4.8, pH: 6.95, DO_pct: 42, Temp_C: 36.8 }, outputs: { Titer_g_L: 3.4, Viability_pct: 89.0, VCD: 15.1 } },
  ],
  "KAL-DS-9B04D7": [
    { barcode: "KAL-1F3C88", inputs: { NSource_pct: 0.5, pH: 6.5, Temp_C: 30 }, outputs: { dOD600: 0.42, Purity_pct: 90.1 } },
    { barcode: "KAL-9D0A44", inputs: { NSource_pct: 1.2, pH: 6.8, Temp_C: 30 }, outputs: { dOD600: 0.61, Purity_pct: 93.4 } },
    { barcode: "KAL-427EB6", inputs: { NSource_pct: 0.2, pH: 6.2, Temp_C: 32 }, outputs: { dOD600: 0.28, Purity_pct: 85.6 } },
    { barcode: "KAL-C610F9", inputs: { NSource_pct: 1.6, pH: 7.0, Temp_C: 29 }, outputs: { dOD600: 0.74, Purity_pct: 95.2 } },
    { barcode: "KAL-73B2AD", inputs: { NSource_pct: 0.9, pH: 6.6, Temp_C: 31 }, outputs: { dOD600: 0.53, Purity_pct: 91.8 } },
  ],
  "KAL-DS-A15C33": [
    { barcode: "KAL-D4A701", inputs: { IPTG_mM: 0.1, Temp_C: 25, pH: 7.0, Induction_h: 4 }, outputs: { Activity_U_mL: 210, Purity_pct: 87.3 } },
    { barcode: "KAL-6F1B39", inputs: { IPTG_mM: 0.5, Temp_C: 30, pH: 7.2, Induction_h: 6 }, outputs: { Activity_U_mL: 340, Purity_pct: 91.0 } },
    { barcode: "KAL-A87C02", inputs: { IPTG_mM: 0.05, Temp_C: 20, pH: 6.8, Induction_h: 3 }, outputs: { Activity_U_mL: 140, Purity_pct: 82.5 } },
    { barcode: "KAL-2E9D45", inputs: { IPTG_mM: 1.0, Temp_C: 32, pH: 7.3, Induction_h: 8 }, outputs: { Activity_U_mL: 405, Purity_pct: 93.6 } },
    { barcode: "KAL-B310FE", inputs: { IPTG_mM: 0.3, Temp_C: 28, pH: 7.1, Induction_h: 5 }, outputs: { Activity_U_mL: 275, Purity_pct: 89.2 } },
  ],
  "KAL-DS-E68204": [
    { barcode: "KAL-77C4A0", inputs: { Agitation_rpm: 300, DO_pct: 40, Feed_rate_mL_h: 5.0, pH: 6.9 }, outputs: { Titer_g_L: 2.8, Viability_pct: 86.4 } },
    { barcode: "KAL-1B98F2", inputs: { Agitation_rpm: 450, DO_pct: 50, Feed_rate_mL_h: 6.2, pH: 7.0 }, outputs: { Titer_g_L: 3.6, Viability_pct: 90.8 } },
    { barcode: "KAL-E0D615", inputs: { Agitation_rpm: 200, DO_pct: 30, Feed_rate_mL_h: 3.8, pH: 6.7 }, outputs: { Titer_g_L: 2.1, Viability_pct: 79.5 } },
    { barcode: "KAL-4A2C88", inputs: { Agitation_rpm: 500, DO_pct: 55, Feed_rate_mL_h: 6.8, pH: 7.1 }, outputs: { Titer_g_L: 4.0, Viability_pct: 92.3 } },
    { barcode: "KAL-9F701D", inputs: { Agitation_rpm: 380, DO_pct: 45, Feed_rate_mL_h: 5.6, pH: 6.95 }, outputs: { Titer_g_L: 3.2, Viability_pct: 88.1 } },
    { barcode: "KAL-C53B27", inputs: { Agitation_rpm: 340, DO_pct: 42, Feed_rate_mL_h: 5.3, pH: 6.9 }, outputs: { Titer_g_L: 3.0, Viability_pct: 87.0 } },
  ],
  "KAL-DS-5D9A17": [
    { barcode: "KAL-30F8A1", inputs: { SelectionPressure: 2, Passage_num: 3, Density_1e6mL: 0.8 }, outputs: { Clone_score: 62, Yield_pct: 71.2 } },
    { barcode: "KAL-8C4D06", inputs: { SelectionPressure: 5, Passage_num: 6, Density_1e6mL: 1.4 }, outputs: { Clone_score: 84, Yield_pct: 88.6 } },
    { barcode: "KAL-B1279E", inputs: { SelectionPressure: 1, Passage_num: 2, Density_1e6mL: 0.5 }, outputs: { Clone_score: 41, Yield_pct: 58.3 } },
    { barcode: "KAL-70A3C4", inputs: { SelectionPressure: 7, Passage_num: 8, Density_1e6mL: 1.9 }, outputs: { Clone_score: 91, Yield_pct: 93.7 } },
    { barcode: "KAL-4E9B18", inputs: { SelectionPressure: 4, Passage_num: 5, Density_1e6mL: 1.1 }, outputs: { Clone_score: 73, Yield_pct: 80.5 } },
  ],
};
