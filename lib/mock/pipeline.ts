// Mock data for the Operations board (app/page.tsx). There is no live
// progress/telemetry feed from the lab yet - this is deterministic STATIC
// data standing in for one, so the board has something real-looking to
// render. Every "now" is baked as a pre-computed string label
// (`etaLabel`, `elapsedLabel`) rather than a live Date/timer: no
// `Math.random()` at module scope and no `Date.now()`/`new Date()` in
// render, so server- and client-rendered HTML always match (no hydration
// warnings) and the board doesn't silently drift as real time passes.
//
// Swap this module for a real client (mirroring lib/experiments.ts's shape)
// once the portal exposes a live pipeline/progress endpoint.

/** The standard bioreactor run procedure, in order. */
export const FED_BATCH_STEPS = [
  "Inoculation",
  "Seed train",
  "Batch growth",
  "Induction",
  "Fed-batch",
  "Harvest",
  "Clarify",
  "Assay/QC",
] as const;

/** The 96-well plate screen procedure, in order. */
export const PLATE_STEPS = ["Seed", "Incubate", "Read", "QC"] as const;

export type RunStatus = "running" | "attention" | "queued" | "completed" | "paused";

export type DriftSeverity = "ok" | "warn" | "alert";

/** One monitored process variable's live value vs. its expected setpoint. */
export interface Drift {
  variable: string;
  value: number;
  expected: number;
  unit: string;
  severity: DriftSeverity;
}

export interface PipelineRun {
  id: string;
  name: string;
  target: string;
  campaign: string;
  vessel: string;
  operator: string;
  status: RunStatus;
  procedure: readonly string[];
  /** Index into `procedure` of the step in progress. `-1` for queued (not
   *  started yet); `procedure.length` for completed (every step is done). */
  currentStepIndex: number;
  /** Overall completion through `procedure`, 0..1. */
  progress: number;
  etaLabel?: string;
  elapsedLabel?: string;
  drift: Drift[];
  /** Recipe inputs for a queued run - mirrors the portal's proposal shape. */
  recipe?: Record<string, number>;
  /**
   * For queued runs, the model's predicted outcome before the run starts.
   * For completed runs, this field is reused to carry the actual measured
   * final value (sigma 0, mode "exploit", why explains it's a measurement
   * not a prediction) - this keeps one field doing double duty instead of
   * adding a second near-identical one to the interface.
   */
  predicted?: { value: number; sigma: number; mode: "explore" | "exploit"; why: string };
  /** Set once a run is completed and analyzed, for linking to /results. */
  resultId?: string;
}

export const PIPELINE_RUNS: PipelineRun[] = [
  // --- Running (fed-batch, mid-procedure) ---
  {
    id: "run-ambr04",
    name: "CHO fed-batch - mAb titer",
    target: "mAb titer (g/L)",
    campaign: "mAb-Titer-Q3",
    vessel: "ambr-04",
    operator: "J. Alvarez",
    status: "running",
    procedure: FED_BATCH_STEPS,
    currentStepIndex: 4,
    progress: 0.58,
    etaLabel: "2h 15m",
    elapsedLabel: "14h ago",
    drift: [],
  },
  {
    id: "run-ambr11",
    name: "CHO fed-batch - mAb titer (high-feed)",
    target: "mAb titer (g/L)",
    campaign: "mAb-Titer-Q3",
    vessel: "ambr-11",
    operator: "R. Chen",
    status: "running",
    procedure: FED_BATCH_STEPS,
    currentStepIndex: 2,
    progress: 0.31,
    etaLabel: "9h 40m",
    elapsedLabel: "6h ago",
    drift: [{ variable: "pH", value: 6.51, expected: 6.5, unit: "", severity: "ok" }],
  },
  {
    id: "run-ambr19",
    name: "E. coli induction - lipase_titer",
    target: "lipase_titer (U/mL)",
    campaign: "Lipase-Yield-Screen",
    vessel: "ambr-19",
    operator: "M. Osei",
    status: "running",
    procedure: FED_BATCH_STEPS,
    currentStepIndex: 3,
    progress: 0.44,
    etaLabel: "5h 05m",
    elapsedLabel: "3h ago",
    drift: [],
  },

  // --- Attention (real drift) ---
  {
    id: "run-sf250-7",
    name: "CHO fed-batch - mAb titer (SF-250 scale-down)",
    target: "mAb titer (g/L)",
    campaign: "mAb-Titer-Q3",
    vessel: "SF-250#7",
    operator: "J. Alvarez",
    status: "attention",
    procedure: FED_BATCH_STEPS,
    currentStepIndex: 4,
    progress: 0.67,
    etaLabel: "1h 50m",
    elapsedLabel: "16h ago",
    drift: [{ variable: "pH", value: 6.8, expected: 6.5, unit: "", severity: "warn" }],
  },
  {
    id: "run-ambr07",
    name: "CHO fed-batch - mAb titer",
    target: "mAb titer (g/L)",
    campaign: "mAb-Titer-Q3",
    vessel: "ambr-07",
    operator: "R. Chen",
    status: "attention",
    procedure: FED_BATCH_STEPS,
    currentStepIndex: 4,
    progress: 0.52,
    etaLabel: "3h 30m",
    elapsedLabel: "11h ago",
    drift: [
      { variable: "DO", value: 18, expected: 40, unit: "%", severity: "alert" },
      { variable: "feed rate", value: 2.1, expected: 3.0, unit: "mL/h", severity: "warn" },
    ],
  },

  // --- Plate screen, running ---
  {
    id: "run-plate08",
    name: "Lipase clone screen - plate 8",
    target: "lipase_titer (U/mL)",
    campaign: "Lipase-Yield-Screen",
    vessel: "Plate-08 (96-well)",
    operator: "M. Osei",
    status: "running",
    procedure: PLATE_STEPS,
    currentStepIndex: 1,
    progress: 0.35,
    etaLabel: "4h 10m",
    elapsedLabel: "2h ago",
    drift: [],
  },

  // --- Queued (mirrors portal proposals: recipe + predicted) ---
  {
    id: "run-queued-1",
    name: "CHO fed-batch - mAb titer (proposal #1)",
    target: "mAb titer (g/L)",
    campaign: "mAb-Titer-Q3",
    vessel: "ambr-15 (assigned)",
    operator: "J. Alvarez",
    status: "queued",
    procedure: FED_BATCH_STEPS,
    currentStepIndex: -1,
    progress: 0,
    drift: [],
    recipe: { "Feed rate (mL/h)": 3.2, "Induction OD600": 8.5, "Temp (C)": 30, "Feed glucose (g/L)": 40 },
    predicted: { value: 4.8, sigma: 0.35, mode: "exploit", why: "Near current optimum, tightens the estimate" },
  },
  {
    id: "run-queued-2",
    name: "CHO fed-batch - mAb titer (proposal #2)",
    target: "mAb titer (g/L)",
    campaign: "mAb-Titer-Q3",
    vessel: "ambr-16 (assigned)",
    operator: "R. Chen",
    status: "queued",
    procedure: FED_BATCH_STEPS,
    currentStepIndex: -1,
    progress: 0,
    drift: [],
    recipe: { "Feed rate (mL/h)": 4.6, "Induction OD600": 6.0, "Temp (C)": 32, "Feed glucose (g/L)": 25 },
    predicted: { value: 5.6, sigma: 0.9, mode: "explore", why: "High-uncertainty region, worth sampling" },
  },

  // --- Completed ---
  {
    id: "run-completed-14",
    name: "CHO fed-batch - mAb titer (run 14)",
    target: "mAb titer (g/L)",
    campaign: "mAb-Titer-Q3",
    vessel: "ambr-02",
    operator: "J. Alvarez",
    status: "completed",
    procedure: FED_BATCH_STEPS,
    currentStepIndex: FED_BATCH_STEPS.length,
    progress: 1,
    elapsedLabel: "6h ago",
    drift: [],
    predicted: { value: 4.6, sigma: 0, mode: "exploit", why: "Final measured titer at harvest" },
    resultId: "run-14",
  },
  {
    id: "run-completed-09",
    name: "E. coli induction - lipase_titer (run 9)",
    target: "lipase_titer (U/mL)",
    campaign: "Lipase-Yield-Screen",
    vessel: "ambr-09",
    operator: "M. Osei",
    status: "completed",
    procedure: FED_BATCH_STEPS,
    currentStepIndex: FED_BATCH_STEPS.length,
    progress: 1,
    elapsedLabel: "22h ago",
    drift: [],
    predicted: { value: 812, sigma: 0, mode: "exploit", why: "Final measured lipase activity" },
    resultId: "run-09",
  },
];

export function runsByStatus(status: RunStatus): PipelineRun[] {
  return PIPELINE_RUNS.filter((r) => r.status === status);
}

/** Counts backing the Operations summary tiles. */
export const PIPELINE_SUMMARY = {
  running: runsByStatus("running").length,
  attention: runsByStatus("attention").length,
  queued: runsByStatus("queued").length,
  completedToday: runsByStatus("completed").length,
};
