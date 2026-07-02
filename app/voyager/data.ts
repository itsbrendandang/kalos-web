/*
 * Seed data for the Voyager product surface.
 *
 * Illustrative content that mirrors voyager_complete_v3.html. The engine does
 * not yet expose a customers/projects API, so these screens render from this
 * module. Types are shaped so a real API can drop in without touching views.
 */

export type ProjectStatus = "drafting" | "in_progress" | "completed" | "terminated";

/** Where a project sits in the closed-loop workflow. Drives the card's phase label. */
export type ProjectStage =
  | { kind: "drafting" }
  | { kind: "phase1"; iteration: number; totalIterations: number }
  | { kind: "phase2"; label: string }
  | { kind: "completed"; completedOn: string };

export type Decision = "promote" | "hold" | "retire";
export type StageState = "done" | "running" | "pending";
export type IterState = "done" | "active" | "locked";

/** A signed or unsigned driver importance, 0-100. */
export interface Driver {
  name: string;
  weight: number;
}

export interface ScalePoint {
  label: string;
  value: number;
  /** Trend vs previous scale, e.g. "-", "down 2%". */
  delta: string;
  warn?: boolean;
}

export interface Candidate {
  id: string;
  decision: Decision;
  name: string;
  conditions: string;
  prob: number;
  uncertainty: string;
  rationale: string;
  drivers: Driver[];
  scaleUp: ScalePoint[];
  warning?: string;
  note?: string;
}

export interface PipelineStage {
  n: number;
  name: string;
  state: StageState;
  chips: string[];
}

export interface IngestedRow {
  run: string;
  cols: string[];
  result: string;
}

export interface Iteration {
  n: number;
  label: string;
  name: string;
  sub: string;
  count: string;
  countLabel: string;
  state: IterState;
  file?: {
    name: string;
    badge: string;
    cols: string[];
    rows: IngestedRow[];
    moreNote: string;
  };
}

export interface DbExperiment {
  name: string;
  id: string;
}

export interface DriverRange {
  name: string;
  weight: number;
  range: string;
}

export interface ReportStat {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}

export interface ReportData {
  stats: ReportStat[];
  overview: string;
  candidates: { decision: Decision; name: string; prob: number; uncertainty: string }[];
  drivers: DriverRange[];
  scaleUp: { label: string; value: number }[];
  phase1Summary: string;
}

export interface PipelineRun {
  number: number;
  status: "not_started" | "running" | "complete";
  runningStage?: number;
}

export interface Project {
  id: string;
  customerId: string;
  customerName: string;
  name: string;
  objective: string;
  status: ProjectStatus;
  stage: ProjectStage;
  target: string;
  /** Which workspace tab a project opens on. */
  defaultTab: "phase1" | "phase2";
  hasTree: "p1" | "p1p2" | null;
  experiments: DbExperiment[];
  config: { name: string; detail: string } | null;
  run: PipelineRun | null;
  pipeline: PipelineStage[];
  candidates: Candidate[];
  iterations: Iteration[];
  report: ReportData | null;
}

// --- Phase 1 detail: mAb Purification (iterations 2 of 4 active) --------------

const MAB_ITERATIONS: Iteration[] = [
  {
    n: 1,
    label: "Iteration 1",
    name: "Latin Hypercube Sampling",
    sub: "Space-filling opening set across all conditions",
    count: "30",
    countLabel: "experiments",
    state: "done",
    file: {
      name: "lhs_batch_001-030.csv",
      badge: "30 rows · all accepted",
      cols: ["Run", "pH elution", "NaCl mM", "Flow mL/min", "Yield %", "Status"],
      rows: [
        { run: "EXP-001", cols: ["3.5", "150", "2.0"], result: "87.4" },
        { run: "EXP-002", cols: ["3.6", "160", "1.8"], result: "91.2" },
      ],
      moreNote: "+ 28 more rows · all accepted",
    },
  },
  {
    n: 2,
    label: "Iteration 2 · Current",
    name: "Bayesian optimization · Explore",
    sub: "First BO set, guided by LHS results",
    count: "10",
    countLabel: "assigned",
    state: "active",
  },
  {
    n: 3,
    label: "Iteration 3",
    name: "Bayesian optimization · Explore",
    sub: "Second BO set",
    count: "~10",
    countLabel: "estimated",
    state: "locked",
  },
  {
    n: 4,
    label: "Iteration 4",
    name: "Bayesian optimization · Exploit",
    sub: "Final set, hones in on best conditions",
    count: "~10",
    countLabel: "estimated",
    state: "locked",
  },
];

const VVP_ITERATIONS: Iteration[] = [
  {
    n: 1,
    label: "Iteration 1 · Current",
    name: "Latin Hypercube Sampling",
    sub: "Space-filling opening set across all conditions",
    count: "30",
    countLabel: "assigned",
    state: "active",
  },
  {
    n: 2,
    label: "Iteration 2",
    name: "Bayesian optimization · Explore",
    sub: "First BO set",
    count: "~10",
    countLabel: "estimated",
    state: "locked",
  },
  {
    n: 3,
    label: "Iteration 3",
    name: "Bayesian optimization · Explore",
    sub: "Second BO set",
    count: "~10",
    countLabel: "estimated",
    state: "locked",
  },
  {
    n: 4,
    label: "Iteration 4",
    name: "Bayesian optimization · Exploit",
    sub: "Final set",
    count: "~10",
    countLabel: "estimated",
    state: "locked",
  },
];

// --- Phase 2 detail: CHO Cell Yield (run #1 complete) ------------------------

const CHO_CANDIDATES: Candidate[] = [
  {
    id: "cand-1",
    decision: "promote",
    name: "Experiment 1 · High temp / low pH",
    conditions: "Temp 34.6°C · pH 7.1 · Glucose 1.4 g/L/d · DO₂ 42%",
    prob: 84,
    uncertainty: "±6%",
    rationale:
      "Consistent yield above threshold at all scales. Low epistemic uncertainty. Domain transfer from CHO-K1 to CHO-DG44 validated with high confidence.",
    drivers: [
      { name: "Temperature", weight: 91 },
      { name: "pH", weight: 68 },
      { name: "Glucose feed", weight: 44 },
      { name: "Dissolved O₂", weight: 28 },
    ],
    scaleUp: [
      { label: "Bench 5mL", value: 88, delta: "-" },
      { label: "Lab 2L", value: 86, delta: "down 2%" },
      { label: "Pilot 50L", value: 82, delta: "down 4%" },
      { label: "GMP 200L", value: 78, delta: "down 4%" },
      { label: "Prod. 2000L", value: 74, delta: "down 4%" },
    ],
  },
  {
    id: "cand-2",
    decision: "promote",
    name: "Experiment 2 · Optimal glucose",
    conditions: "Temp 35.0°C · pH 7.0 · Glucose 1.6 g/L/d · DO₂ 40%",
    prob: 78,
    uncertainty: "±9%",
    rationale:
      "Strong at bench and pilot. Confidence narrows at 200L; validate dissolved oxygen control before advancing. Domain transfer stable.",
    drivers: [
      { name: "Glucose feed", weight: 85 },
      { name: "Temperature", weight: 55 },
      { name: "DO₂", weight: 40 },
    ],
    scaleUp: [
      { label: "Bench 5mL", value: 83, delta: "-" },
      { label: "Lab 2L", value: 80, delta: "down 3%" },
      { label: "Pilot 50L", value: 76, delta: "down 4%" },
      { label: "GMP 200L", value: 68, delta: "down 8%", warn: true },
    ],
    warning: "Validate DO₂ control at 200L before advancing. Confidence band widens significantly above 50L.",
  },
  {
    id: "cand-3",
    decision: "hold",
    name: "Experiment 3 · Mid-range all",
    conditions: "Temp 34.0°C · pH 7.2 · Glucose 1.2 g/L/d · DO₂ 38%",
    prob: 61,
    uncertainty: "±18%",
    rationale:
      "Uncertainty too wide (±18%) to advance. Insufficient replicate data at 50L. Upload more validation runs at pilot scale, then re-run the pipeline.",
    drivers: [],
    scaleUp: [],
    note: "Upload pilot-scale validation runs, then re-run the pipeline to reassess.",
  },
];

const CHO_PIPELINE: PipelineStage[] = [
  { n: 1, name: "Data ingestion", state: "done", chips: ["3 accepted"] },
  { n: 2, name: "Preprocessing", state: "done", chips: ["Matrix locked"] },
  { n: 3, name: "Ensemble inference", state: "done", chips: ["3 scored"] },
  { n: 4, name: "Calibration", state: "done", chips: ["ECE 0.028"] },
  { n: 5, name: "Scoring & gating", state: "done", chips: ["2 promote", "1 hold"] },
  { n: 6, name: "Stress testing", state: "done", chips: ["All transfer"] },
  { n: 7, name: "Scale-up projection", state: "done", chips: ["Bench→2000L"] },
  { n: 8, name: "Driver analysis", state: "done", chips: ["4 drivers ranked"] },
  { n: 9, name: "Hyperparameter opt.", state: "done", chips: ["Retune complete"] },
];

const CHO_REPORT: ReportData = {
  stats: [
    { label: "Total experiments", value: "3", sub: "Phase 1 & 2" },
    { label: "Promoted candidates", value: "2", sub: "Ready for scale-up", accent: true },
    { label: "Best success prob.", value: "84%", sub: "±6% uncertainty" },
    { label: "Pipeline runs", value: "1", sub: "Run #1 · final" },
  ],
  overview:
    "IgG titer optimization for Customer 1. Phase 1 ran experiments across 4 conditions at microscale. Bayesian optimization identified temperature and pH as the dominant drivers. Phase 2 scale-up confirmed two candidates viable for production.",
  candidates: [
    { decision: "promote", name: "Experiment 1 · High temp", prob: 84, uncertainty: "±6%" },
    { decision: "promote", name: "Experiment 2 · Opt. glucose", prob: 78, uncertainty: "±9%" },
    { decision: "hold", name: "Experiment 3 · Mid-range", prob: 61, uncertainty: "±18%" },
  ],
  drivers: [
    { name: "Temperature", weight: 91, range: "34-35 °C" },
    { name: "pH", weight: 68, range: "7.0-7.2" },
    { name: "Glucose feed", weight: 44, range: "1.3-1.6 g/L/d" },
    { name: "Dissolved O₂", weight: 28, range: "38-44%" },
  ],
  scaleUp: [
    { label: "Bench", value: 84 },
    { label: "Lab 2L", value: 81 },
    { label: "Pilot", value: 78 },
    { label: "GMP", value: 76 },
    { label: "Prod.", value: 74 },
  ],
  phase1Summary:
    "4 iterations. LHS (30) then BO Explore (10), BO Explore (10), BO Exploit (10). Best yield: 3.91 g/L (EXP-042). Convergence confirmed by iteration 4.",
};

const CHO_EXPERIMENTS: DbExperiment[] = [
  { name: "Experiment 1", id: "ID 1" },
  { name: "Experiment 2", id: "ID 2" },
  { name: "Experiment 3", id: "ID 3" },
];

// --- Customers ---------------------------------------------------------------

export interface Customer {
  id: string;
  name: string;
  address: string;
  projects: Project[];
}

const P_CHO: Project = {
  id: "p-cho",
  customerId: "c1",
  customerName: "Customer 1",
  name: "CHO Cell Yield Optimization",
  objective: "Optimize IgG titer yield across scale-up conditions",
  status: "in_progress",
  stage: { kind: "phase2", label: "Scale-up" },
  target: "IgG titer",
  defaultTab: "phase2",
  hasTree: "p1p2",
  experiments: CHO_EXPERIMENTS,
  config: { name: "pipeline_config_v1.yaml", detail: "4 volumes · CHO-K1→DG44 · 3 gating thresholds" },
  run: { number: 1, status: "complete" },
  pipeline: CHO_PIPELINE,
  candidates: CHO_CANDIDATES,
  iterations: [],
  report: CHO_REPORT,
};

const P_MAB: Project = {
  id: "p-mab",
  customerId: "c1",
  customerName: "Customer 1",
  name: "mAb Purification Process",
  objective: "Maximize antibody yield through chromatography conditions",
  status: "in_progress",
  stage: { kind: "phase1", iteration: 2, totalIterations: 4 },
  target: "Antibody yield",
  defaultTab: "phase1",
  hasTree: "p1",
  experiments: [],
  config: null,
  run: null,
  pipeline: [],
  candidates: [],
  iterations: MAB_ITERATIONS,
  report: null,
};

const P_VVP: Project = {
  id: "p-vvp",
  customerId: "c2",
  customerName: "Customer 2",
  name: "Viral Vector Production",
  objective: "Scale viral vector titer for gene therapy applications",
  status: "in_progress",
  stage: { kind: "phase1", iteration: 1, totalIterations: 4 },
  target: "Vector titer",
  defaultTab: "phase1",
  hasTree: null,
  experiments: [],
  config: null,
  run: null,
  pipeline: [],
  candidates: [],
  iterations: VVP_ITERATIONS,
  report: null,
};

const P_LNP: Project = {
  id: "p-lnp",
  customerId: "c2",
  customerName: "Customer 2",
  name: "Lipid Nanoparticle Formulation",
  objective: "Optimize LNP encapsulation efficiency for mRNA delivery",
  status: "drafting",
  stage: { kind: "drafting" },
  target: "Encapsulation efficiency",
  defaultTab: "phase1",
  hasTree: null,
  experiments: [],
  config: null,
  run: null,
  pipeline: [],
  candidates: [],
  iterations: [],
  report: null,
};

export const CUSTOMERS: Customer[] = [
  {
    id: "c1",
    name: "Customer 1",
    address: "123 Science Park, Cambridge, MA 02139",
    projects: [P_CHO, P_MAB],
  },
  {
    id: "c2",
    name: "Customer 2",
    address: "88 Innovation Way, South San Francisco, CA 94080",
    projects: [P_VVP, P_LNP],
  },
];

const ALL_PROJECTS: Project[] = CUSTOMERS.flatMap((c) => c.projects);

export function getProject(id: string): Project | undefined {
  return ALL_PROJECTS.find((p) => p.id === id);
}

export function allProjectIds(): string[] {
  return ALL_PROJECTS.map((p) => p.id);
}
