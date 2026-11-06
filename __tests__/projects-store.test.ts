import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CUSTOMERS, getProject as getSeedProject } from "@/app/projects/data";
import {
  findProjectInCustomers,
  getProjectWithFallback,
  initialProjectsState,
  projectsReducer,
  clearLegacyPersistedState,
  LEGACY_STORAGE_KEY,
} from "@/lib/projects-store";

describe("projectsReducer addCustomer", () => {
  it("appends a new customer with no projects, leaving existing customers untouched", () => {
    const before = initialProjectsState();
    const after = projectsReducer(before, {
      type: "addCustomer",
      customer: { id: "c-new", name: "New Biotech", address: "1 Test Way" },
    });

    expect(after.customers).toHaveLength(before.customers.length + 1);
    const added = after.customers.at(-1);
    expect(added).toEqual({ id: "c-new", name: "New Biotech", address: "1 Test Way", projects: [] });
    expect(after.customers.slice(0, -1)).toEqual(before.customers);
  });
});

describe("projectsReducer addProject", () => {
  it("attaches the new project to the customer matching customerName, not any other customer", () => {
    const before = initialProjectsState();
    const customerName = before.customers[0].name;
    const otherCustomer = before.customers[1];

    const after = projectsReducer(before, {
      type: "addProject",
      customerName,
      project: { id: "p-new", name: "New Project", objective: "Test objective", status: "in_progress" },
      today: "Jan 1, 2026",
    });

    const targetCustomer = after.customers.find((c) => c.name === customerName);
    expect(targetCustomer?.projects.some((p) => p.id === "p-new")).toBe(true);

    const added = targetCustomer?.projects.find((p) => p.id === "p-new");
    expect(added).toMatchObject({
      id: "p-new",
      name: "New Project",
      objective: "Test objective",
      status: "in_progress",
      customerName,
    });
    expect(added?.stage).toEqual({ kind: "phase1", iteration: 1, totalIterations: 4 });

    // Every other customer's project list is unaffected.
    const untouchedOther = after.customers.find((c) => c.id === otherCustomer.id);
    expect(untouchedOther?.projects).toEqual(otherCustomer.projects);
  });

  it("is a no-op when no customer matches customerName", () => {
    const before = initialProjectsState();
    const after = projectsReducer(before, {
      type: "addProject",
      customerName: "Does Not Exist",
      project: { id: "p-new", name: "New Project", objective: "Test", status: "in_progress" },
      today: "Jan 1, 2026",
    });
    expect(after).toEqual(before);
  });

  it("stages a project added as Completed with the given completion date", () => {
    const before = initialProjectsState();
    const customerName = before.customers[0].name;
    const after = projectsReducer(before, {
      type: "addProject",
      customerName,
      project: { id: "p-done", name: "Done Project", objective: "Test", status: "completed" },
      today: "Mar 3, 2026",
    });
    const added = after.customers.find((c) => c.name === customerName)?.projects.find((p) => p.id === "p-done");
    expect(added?.stage).toEqual({ kind: "completed", completedOn: "Mar 3, 2026" });
  });
});

describe("projectsReducer updateProject", () => {
  it("mutates only the target project's editable fields, leaving every other project unchanged", () => {
    const before = initialProjectsState();
    const targetId = CUSTOMERS[0].projects[0].id;
    const siblingId = CUSTOMERS[0].projects[1]?.id;

    const after = projectsReducer(before, {
      type: "updateProject",
      id: targetId,
      patch: { name: "Renamed project", objective: "New objective", status: "terminated" },
    });

    const target = findProjectInCustomers(after.customers, targetId);
    expect(target).toMatchObject({ name: "Renamed project", objective: "New objective", status: "terminated" });

    if (siblingId) {
      const sibling = findProjectInCustomers(after.customers, siblingId);
      const originalSibling = findProjectInCustomers(before.customers, siblingId);
      expect(sibling).toEqual(originalSibling);
    }

    // Every project outside the target customer is untouched too.
    for (const customer of before.customers.slice(1)) {
      const afterCustomer = after.customers.find((c) => c.id === customer.id);
      expect(afterCustomer?.projects).toEqual(customer.projects);
    }
  });

  it("is a no-op for an unknown project id", () => {
    const before = initialProjectsState();
    const after = projectsReducer(before, {
      type: "updateProject",
      id: "does-not-exist",
      patch: { name: "X", objective: "Y", status: "drafting" },
    });
    expect(after).toEqual(before);
  });
});

describe("projectsReducer markProjectComplete", () => {
  it("marks a project completed with the given date", () => {
    const before = initialProjectsState();
    const after = projectsReducer(before, { type: "markProjectComplete", projectId: "p-mab", completedOn: "Jun 1, 2026" });
    const mabAfter = findProjectInCustomers(after.customers, "p-mab");
    expect(mabAfter?.status).toBe("completed");
    expect(mabAfter?.stage).toEqual({ kind: "completed", completedOn: "Jun 1, 2026" });
  });
});

describe("getProjectWithFallback", () => {
  it("falls back to the seed data for an id not present in the live store", () => {
    const found = getProjectWithFallback([], "p-cho");
    expect(found).toEqual(getSeedProject("p-cho"));
  });

  it("returns undefined for an id that exists in neither the live store nor the seed", () => {
    expect(getProjectWithFallback([], "not-a-real-id")).toBeUndefined();
  });

  it("prefers the live store's version over the seed when both have the id", () => {
    const before = initialProjectsState();
    const after = projectsReducer(before, {
      type: "updateProject",
      id: "p-mab",
      patch: { name: "Renamed", objective: "Test", status: "in_progress" },
    });
    expect(getProjectWithFallback(after.customers, "p-mab")?.name).toBe("Renamed");
  });
});

describe("no customer data in localStorage", () => {
  it("removes the legacy projects-store-v1 key", () => {
    const items: Record<string, string> = {
      [LEGACY_STORAGE_KEY]: JSON.stringify({ customers: [{ name: "Real Co" }] }),
      theme: "dark",
    };
    clearLegacyPersistedState({ removeItem: (k: string) => void delete items[k] });
    expect(items[LEGACY_STORAGE_KEY]).toBeUndefined();
    expect(items.theme).toBe("dark");
    expect(LEGACY_STORAGE_KEY).toBe("projects-store-v1");
  });

  it("tolerates inaccessible storage", () => {
    expect(() =>
      clearLegacyPersistedState({
        removeItem: () => {
          throw new Error("denied");
        },
      }),
    ).not.toThrow();
  });

  it("store modules never write to storage", () => {
    for (const f of ["../lib/projects-store.ts", "../components/projects/store-context.tsx"]) {
      expect(readFileSync(new URL(f, import.meta.url), "utf8")).not.toMatch(/setItem|getItem/);
    }
  });
});
