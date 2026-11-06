/*
 * Seed data for the Projects surface.
 *
 * Illustrative content: Kalos has no customers/projects API, so these screens
 * render from this module and from what the viewer adds in the browser. Types
 * are shaped so a real API can drop in without touching the views. Nothing
 * here comes from Kalos.
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
  /** When true, the project is the campaign Kalos is working on; its workspace links to the Overview. */
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
  { name: "Run 1", id: "ID 1" },
  { name: "Run 2", id: "ID 2" },
  { name: "Run 3", id: "ID 3" },
];

const P_CHO: Project = {
  id: "p-cho",
  customerId: "c1",
  customerName: "Customer 1",
  name: "CHO Cell Yield Optimization",
  objective: "Raise IgG titer across scale-up recipes",
  status: "in_progress",
  stage: { kind: "phase2", label: "Scaling up" },
  experiments: CHO_EXPERIMENTS,
  notes: "Three runs recorded at bench scale. The next step is a pilot-scale run on the two best recipes.",
};

const P_MAB: Project = {
  id: "p-mab",
  customerId: "c1",
  customerName: "Customer 1",
  name: "mAb Purification Process",
  objective: "Raise antibody yield through the chromatography recipe",
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
  objective: "Raise LNP encapsulation efficiency for mRNA delivery",
  status: "drafting",
  stage: { kind: "drafting" },
  experiments: [],
};

const P_LIVE: Project = {
  id: "p-live",
  customerId: "c3",
  customerName: "In-house R&D",
  name: "Media DoE",
  objective: "Propose the next media runs from the uploaded run sheet",
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
