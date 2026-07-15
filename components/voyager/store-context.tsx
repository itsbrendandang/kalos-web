"use client";

/*
 * React wiring around lib/voyager-store.ts. Mounted once in app/voyager/layout.tsx
 * so it survives client-side navigation between the index and the per-project
 * workspace routes - that's what lets a create/edit in one route still be
 * visible after navigating to the other.
 *
 * Seeded from the CUSTOMERS constant (app/voyager/data.ts stays the source of
 * truth for initial content), then hydrated from localStorage in an effect -
 * never read localStorage during render, so the first client render matches
 * the server-rendered seed HTML exactly and there is no hydration mismatch.
 */

import { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";
import type { Customer, PipelineStage, Project, ProjectStatus } from "@/app/voyager/data";
import {
  getProjectWithFallback,
  initialVoyagerState,
  voyagerReducer,
  type NewCustomerInput,
  type ProjectEditInput,
  type VoyagerState,
} from "@/lib/voyager-store";

const STORAGE_KEY = "voyager-store-v1";

function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function today(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

interface VoyagerStoreValue {
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

const VoyagerStoreContext = createContext<VoyagerStoreValue | null>(null);

export function VoyagerStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(voyagerReducer, undefined, initialVoyagerState);
  // Gates the persist effect below. Deliberately state (not a ref): the hydrate
  // effect calls dispatch(...) and setHydrated(true) together in the same tick,
  // so React batches them into a single re-render - the persist effect below
  // only ever observes hydrated=true in the same render where `state` already
  // reflects the hydration. A ref would flip to true on a render that still
  // closes over the pre-hydration `state`, letting the persist effect write
  // the seed over real localStorage data before the hydrated state lands
  // (this actually happened in dev, where Strict Mode double-invokes effects).
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && Array.isArray((parsed as VoyagerState).customers)) {
          dispatch({ type: "hydrate", state: parsed as VoyagerState });
        }
      }
    } catch {
      // Corrupt or inaccessible storage - fall back to the seed state.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota/availability errors - persistence is best-effort.
    }
  }, [state, hydrated]);

  const value = useMemo<VoyagerStoreValue>(
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

  return <VoyagerStoreContext.Provider value={value}>{children}</VoyagerStoreContext.Provider>;
}

export function useVoyagerStore(): VoyagerStoreValue {
  const ctx = useContext(VoyagerStoreContext);
  if (!ctx) throw new Error("useVoyagerStore must be used within a VoyagerStoreProvider");
  return ctx;
}
