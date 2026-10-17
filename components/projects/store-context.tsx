"use client";

/*
 * React wiring around lib/projects-store.ts. Mounted once by the app shell
 * (components/workbench/app-shell.tsx), so it survives client-side navigation
 * between the index and the per-project workspace routes (a create or edit in
 * one route is still visible after navigating to the other), and the Projects
 * explorer lists the same projects.
 *
 * Seeded from the CUSTOMERS constant (clearly-labelled illustrative demo data
 * in app/projects/data.ts, not real customers). State is in memory only: customer
 * names, addresses and objectives are never written to localStorage, and a
 * legacy `projects-store-v1` key from older builds is removed on load.
 */

import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { Customer, PipelineStage, Project, ProjectStatus } from "@/app/projects/data";
import {
  clearLegacyPersistedState,
  getProjectWithFallback,
  initialProjectsState,
  projectsReducer,
  type NewCustomerInput,
  type ProjectEditInput,
} from "@/lib/projects-store";

function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function today(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

interface ProjectsStoreValue {
  customers: Customer[];
  getProject: (id: string) => Project | undefined;
  addCustomer: (input: Omit<NewCustomerInput, "id">) => void;
  updateCustomer: (id: string, patch: { name: string; address: string }) => void;
  addProject: (customerName: string, input: { name: string; objective: string; status: ProjectStatus }) => void;
  updateProject: (id: string, patch: ProjectEditInput) => void;
  advanceIteration: (projectId: string) => void;
  runPipeline: (projectId: string, stageTemplate: PipelineStage[]) => void;
  markProjectComplete: (projectId: string) => void;
}

const ProjectsStoreContext = createContext<ProjectsStoreValue | null>(null);

export function ProjectsStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(projectsReducer, undefined, initialProjectsState);

  useEffect(() => {
    try {
      clearLegacyPersistedState(window.localStorage);
    } catch {
      // Inaccessible storage - nothing to clear.
    }
  }, []);

  const value = useMemo<ProjectsStoreValue>(
    () => ({
      customers: state.customers,
      getProject: (id) => getProjectWithFallback(state.customers, id),
      addCustomer: ({ name, address }) => dispatch({ type: "addCustomer", customer: { id: generateId("c"), name, address } }),
      updateCustomer: (id, patch) => dispatch({ type: "updateCustomer", id, patch }),
      addProject: (customerName, input) =>
        dispatch({ type: "addProject", customerName, project: { id: generateId("p"), ...input }, today: today() }),
      updateProject: (id, patch) => dispatch({ type: "updateProject", id, patch }),
      advanceIteration: (projectId) => dispatch({ type: "advanceIteration", projectId }),
      runPipeline: (projectId, stageTemplate) => dispatch({ type: "runPipeline", projectId, stageTemplate }),
      markProjectComplete: (projectId) => dispatch({ type: "markProjectComplete", projectId, completedOn: today() }),
    }),
    [state],
  );

  return <ProjectsStoreContext.Provider value={value}>{children}</ProjectsStoreContext.Provider>;
}

export function useProjectsStore(): ProjectsStoreValue {
  const ctx = useContext(ProjectsStoreContext);
  if (!ctx) throw new Error("useProjectsStore must be used within a ProjectsStoreProvider");
  return ctx;
}
