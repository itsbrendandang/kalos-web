/*
 * Seed data for the Voyager Projects home.
 *
 * This is illustrative content that mirrors voyager_complete_v3.html — the
 * engine does not yet expose a customers/projects API. The shape is designed
 * so a real `GET /api/customers` can drop in without touching the view.
 */

export type ProjectStatus = "drafting" | "in_progress" | "completed" | "terminated";

/** Where a project sits in the closed-loop workflow. Drives the card's phase label. */
export type ProjectStage =
  | { kind: "drafting" }
  | { kind: "phase1"; iteration: number; totalIterations: number }
  | { kind: "phase2"; label: string }
  | { kind: "completed"; completedOn: string };

export interface Project {
  id: string;
  name: string;
  objective: string;
  status: ProjectStatus;
  stage: ProjectStage;
}

export interface Customer {
  id: string;
  name: string;
  address: string;
  projects: Project[];
}

export const CUSTOMERS: Customer[] = [
  {
    id: "c1",
    name: "Customer 1",
    address: "123 Science Park, Cambridge, MA 02139",
    projects: [
      {
        id: "p-cho",
        name: "CHO Cell Yield Optimization",
        objective: "Optimize IgG titer yield across scale-up conditions",
        status: "in_progress",
        stage: { kind: "phase2", label: "Scale-up" },
      },
      {
        id: "p-mab",
        name: "mAb Purification Process",
        objective: "Maximize antibody yield through chromatography conditions",
        status: "in_progress",
        stage: { kind: "phase1", iteration: 2, totalIterations: 4 },
      },
    ],
  },
  {
    id: "c2",
    name: "Customer 2",
    address: "88 Innovation Way, South San Francisco, CA 94080",
    projects: [
      {
        id: "p-vvp",
        name: "Viral Vector Production",
        objective: "Scale viral vector titer for gene therapy applications",
        status: "in_progress",
        stage: { kind: "phase1", iteration: 1, totalIterations: 4 },
      },
      {
        id: "p-lnp",
        name: "Lipid Nanoparticle Formulation",
        objective: "Optimize LNP encapsulation efficiency for mRNA delivery",
        status: "drafting",
        stage: { kind: "drafting" },
      },
    ],
  },
];
