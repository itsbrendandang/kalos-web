/*
 * In-memory store for the Projects surface (never persisted).
 *
 * The Projects surface has no backend for customers/projects (see app/projects/data.ts) - the
 * product decision is to wire creates/edits to real client-side state instead,
 * so the modals stop being active-but-inert. This module holds the pure,
 * framework-free reducer + helpers; the React context that wraps it
 * (useReducer, in memory only - nothing is written to browser storage) lives in
 * components/projects/store-context.tsx. Keeping the logic here means it can be
 * unit tested directly, with no DOM involved.
 */

import { CUSTOMERS, getProject as getSeedProject, type Customer, type Project, type ProjectStage, type ProjectStatus } from "@/app/projects/data";

export interface ProjectsState {
  customers: Customer[];
}

export function initialProjectsState(): ProjectsState {
  return { customers: CUSTOMERS };
}

/** Legacy localStorage key. Earlier versions persisted customer names,
 *  addresses and project objectives here; that data is customer-sensitive and
 *  must not live in browser storage, so the store is now in-memory only and
 *  this key is only ever removed. */
export const LEGACY_STORAGE_KEY = "projects-store-v1";

/** Removes any legacy persisted projects state. Safe on inaccessible storage. */
export function clearLegacyPersistedState(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Inaccessible storage - nothing to clear.
  }
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
    experiments: [],
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
