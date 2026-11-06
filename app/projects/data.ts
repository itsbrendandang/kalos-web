/*
 * Seed data for the Projects surface.
 *
 * Illustrative content: the engine does not expose a customers/projects API,
 * so these screens render from this module and from what the viewer adds in
 * the browser. Types are shaped so a real API can drop in without touching the
 * views. Nothing here is an engine output.
 */

export type ProjectStatus = "drafting" | "in_progress" | "completed" | "terminated";

/** Where a project sits in the closed-loop workflow. Drives the stage badge. */
export type ProjectStage =
  | { kind: "drafting" }
  | { kind: "phase1"; iteration: number; totalIterations: number }
  | { kind: "phase2"; label: string }
  | { kind: "completed"; completedOn: string };

export interface DbExperiment {
  name: string;
  id: string;
}

export interface Project {
  id: string;
  customerId: string;
  customerName: string;
  name: string;
  objective: string;
  status: ProjectStatus;
  stage: ProjectStage;
  /** When true, the project is the campaign the engine is scoring; its workspace links to the Overview. */
  live?: boolean;
  experiments: DbExperiment[];
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  address: string;
  projects: Project[];
}

/** The stage in plain words, for the badge and the workspace description. */
export function stageLabel(stage: ProjectStage): string {
  switch (stage.kind) {
    case "drafting":
      return "Drafting";
    case "phase1":
      return `Round ${stage.iteration} of ${stage.totalIterations}`;
    case "phase2":
      return stage.label;
    case "completed":
      return "Completed";
  }
}

const CHO_EXPERIMENTS: DbExperiment[] = [
  { name: "Experiment 1", id: "ID 1" },
  { name: "Experiment 2", id: "ID 2" },
  { name: "Experiment 3", id: "ID 3" },
];

const P_CHO: Project = {
  id: "p-cho",
  customerId: "c1",
  customerName: "Customer 1",
  name: "CHO Cell Yield Optimization",
  objective: "Optimize IgG titer yield across scale-up conditions",
  status: "in_progress",
  stage: { kind: "phase2", label: "Scaling up" },
  experiments: CHO_EXPERIMENTS,
  notes: "Three experiments recorded at bench scale. The next step is a pilot-scale run on the two best recipes.",
};

const P_MAB: Project = {
  id: "p-mab",
  customerId: "c1",
  customerName: "Customer 1",
  name: "mAb Purification Process",
  objective: "Maximize antibody yield through chromatography conditions",
  status: "in_progress",
  stage: { kind: "phase1", iteration: 2, totalIterations: 4 },
  experiments: [],
};

const P_VVP: Project = {
  id: "p-vvp",
  customerId: "c2",
  customerName: "Customer 2",
  name: "Viral Vector Production",
  objective: "Scale viral vector titer for gene therapy applications",
  status: "in_progress",
  stage: { kind: "phase1", iteration: 1, totalIterations: 4 },
  experiments: [],
};

const P_LNP: Project = {
  id: "p-lnp",
  customerId: "c2",
  customerName: "Customer 2",
  name: "Lipid Nanoparticle Formulation",
  objective: "Optimize LNP encapsulation efficiency for mRNA delivery",
  status: "drafting",
  stage: { kind: "drafting" },
  experiments: [],
};

const P_LIVE: Project = {
  id: "p-live",
  customerId: "c3",
  customerName: "In-house R&D",
  name: "Media DoE",
  objective: "Recommend the next media experiments from the uploaded run sheet",
  status: "in_progress",
  stage: { kind: "phase2", label: "In the loop" },
  live: true,
  experiments: [],
};

/** Illustrative customers (placeholder names and addresses, not real). Held in memory only; never persisted. */
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
  {
    id: "c3",
    name: "In-house R&D",
    address: "Internal",
    projects: [P_LIVE],
  },
];

const ALL_PROJECTS: Project[] = CUSTOMERS.flatMap((c) => c.projects);

export function getProject(id: string): Project | undefined {
  return ALL_PROJECTS.find((p) => p.id === id);
}

export function allProjectIds(): string[] {
  return ALL_PROJECTS.map((p) => p.id);
}

/** Seed project ids, so the views can badge seed content as example data. */
export const SEED_PROJECT_IDS: ReadonlySet<string> = new Set(ALL_PROJECTS.map((p) => p.id));
