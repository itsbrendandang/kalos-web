/*
 * Client-side persistence store for the Projects surface.
 *
 * The Projects surface has no backend for customers/projects (see app/projects/data.ts) - the
 * product decision is to wire creates/edits to real client-side state instead,
 * so the modals and workspace controls stop being active-but-inert. This module
 * holds the pure, framework-free reducer + helpers; the React context that
 * wraps it (with useReducer + localStorage) lives in
 * components/projects/store-context.tsx. Keeping the logic here means it can be
 * unit tested directly, with no DOM involved.
 */

import {
  CUSTOMERS,
  getProject as getSeedProject,
  type Customer,
  type PipelineStage,
  type Project,
  type ProjectStage,
  type ProjectStatus,
} from "@/app/projects/data";

export interface ProjectsState {
  customers: Customer[];
}

export function initialProjectsState(): ProjectsState {
  return { customers: CUSTOMERS };
}

export const STORAGE_KEY = "projects-store-v1";
// The key this store used while the surface was named Voyager. Still read
// (when STORAGE_KEY is absent) so creates/edits saved before the rename
// survive it; the provider deletes it once STORAGE_KEY has been written.
export const LEGACY_STORAGE_KEY = "voyager-store-v1";

/** The persisted state, or null when nothing usable is stored (absent,
 *  corrupt, or the wrong shape) - the caller then keeps the seed state. */
export function readPersistedState(storage: Pick<Storage, "getItem">): ProjectsState | null {
  const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as ProjectsState).customers)) {
    return parsed as ProjectsState;
  }
  return null;
}

export interface NewCustomerInput {
  id: string;
  name: string;
  address: string;
}

export interface NewProjectInput {
  id: string;
  name: string;
  objective: string;
  status: ProjectStatus;
}

export interface ProjectEditInput {
  name: string;
  objective: string;
  status: ProjectStatus;
}

export type ProjectsAction =
  | { type: "hydrate"; state: ProjectsState }
  | { type: "addCustomer"; customer: NewCustomerInput }
  | { type: "updateCustomer"; id: string; patch: { name: string; address: string } }
  | { type: "addProject"; customerName: string; project: NewProjectInput; today: string }
  | { type: "updateProject"; id: string; patch: ProjectEditInput }
  | { type: "advanceIteration"; projectId: string }
  | { type: "runPipeline"; projectId: string; stageTemplate: PipelineStage[] }
  | { type: "markProjectComplete"; projectId: string; completedOn: string };

/** Finds a project across all customers in the live store state (no seed fallback). */
export function findProjectInCustomers(customers: Customer[], id: string): Project | undefined {
  for (const customer of customers) {
    const project = customer.projects.find((p) => p.id === id);
    if (project) return project;
  }
  return undefined;
}

/** Live-store lookup with a fallback to the seed data, for ids the store hasn't touched. */
export function getProjectWithFallback(customers: Customer[], id: string): Project | undefined {
  return findProjectInCustomers(customers, id) ?? getSeedProject(id);
}

function stageForNewProject(status: ProjectStatus, today: string): ProjectStage {
  switch (status) {
    case "drafting":
      return { kind: "drafting" };
    case "completed":
      return { kind: "completed", completedOn: today };
    case "in_progress":
    case "terminated":
      return { kind: "phase1", iteration: 1, totalIterations: 4 };
  }
}

function buildNewProject(customer: Customer, input: NewProjectInput, today: string): Project {
  return {
    id: input.id,
    customerId: customer.id,
    customerName: customer.name,
    name: input.name,
    objective: input.objective,
    status: input.status,
    stage: stageForNewProject(input.status, today),
    target: input.objective,
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
}

/** Marks the current active iteration done and unlocks the next one, if any. */
function advanceProjectIteration(project: Project): Project {
  if (project.stage.kind !== "phase1") return project;
  const activeIndex = project.iterations.findIndex((it) => it.state === "active");
  if (activeIndex === -1) return project;

  const iterations = project.iterations.map((it, i) => {
    if (i === activeIndex) return { ...it, state: "done" as const };
    if (i === activeIndex + 1 && it.state === "locked") return { ...it, state: "active" as const };
    return it;
  });

  const nextIteration = Math.min(project.stage.iteration + 1, project.stage.totalIterations);
  return {
    ...project,
    iterations,
    stage: { ...project.stage, iteration: nextIteration },
  };
}

/** Transitions a project's pipeline run from setup to complete. */
function runProjectPipeline(project: Project, stageTemplate: PipelineStage[]): Project {
  const stages = project.pipeline.length > 0 ? project.pipeline : stageTemplate;
  return {
    ...project,
    run: { number: (project.run?.number ?? 0) + 1, status: "complete" },
    pipeline: stages.map((s) => ({ ...s, state: "done", chips: s.chips.length > 0 ? s.chips : ["Complete"] })),
  };
}

function mapProject(customers: Customer[], id: string, fn: (project: Project) => Project): Customer[] {
  return customers.map((customer) => {
    if (!customer.projects.some((p) => p.id === id)) return customer;
    return { ...customer, projects: customer.projects.map((p) => (p.id === id ? fn(p) : p)) };
  });
}

export function projectsReducer(state: ProjectsState, action: ProjectsAction): ProjectsState {
  switch (action.type) {
    case "hydrate":
      return action.state;

    case "addCustomer":
      return {
        customers: [...state.customers, { id: action.customer.id, name: action.customer.name, address: action.customer.address, projects: [] }],
      };

    case "updateCustomer":
      return {
        customers: state.customers.map((c) => (c.id === action.id ? { ...c, name: action.patch.name, address: action.patch.address } : c)),
      };

    case "addProject": {
      const customer = state.customers.find((c) => c.name === action.customerName);
      if (!customer) return state;
      const project = buildNewProject(customer, action.project, action.today);
      return {
        customers: state.customers.map((c) => (c.id === customer.id ? { ...c, projects: [...c.projects, project] } : c)),
      };
    }

    case "updateProject":
      return {
        customers: mapProject(state.customers, action.id, (p) => ({
          ...p,
          name: action.patch.name,
          objective: action.patch.objective,
          status: action.patch.status,
        })),
      };

    case "advanceIteration":
      return { customers: mapProject(state.customers, action.projectId, advanceProjectIteration) };

    case "runPipeline":
      return { customers: mapProject(state.customers, action.projectId, (p) => runProjectPipeline(p, action.stageTemplate)) };

    case "markProjectComplete":
      return {
        customers: mapProject(state.customers, action.projectId, (p) => ({
          ...p,
          status: "completed",
          stage: { kind: "completed", completedOn: action.completedOn },
        })),
      };

    default:
      return state;
  }
}

// --- CSV export (Projects report "Export CSV") -------------------------------

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(values: (string | number)[]): string {
  return values.map(csvField).join(",");
}

/**
 * Builds a CSV export of a project's final report: stats, candidate decisions,
 * and top drivers, one section per row group under a shared header. Pure
 * string-building only - the caller (project-report.tsx) turns this into a
 * download via a Blob + object URL.
 */
export function buildProjectReportCsv(project: Project): string {
  const rows: string[] = [csvRow(["Section", "Name", "Value", "Detail"])];
  const r = project.report;
  if (r) {
    for (const s of r.stats) rows.push(csvRow(["Stat", s.label, s.value, s.sub]));
    for (const c of r.candidates) rows.push(csvRow(["Candidate", c.name, `${c.prob}%`, c.uncertainty]));
    for (const d of r.drivers) rows.push(csvRow(["Driver", d.name, `${d.weight}%`, d.range]));
  }
  return rows.join("\n");
}
