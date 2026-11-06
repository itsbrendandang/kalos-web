// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushAudit, recordAudit, setAuditActor } from "@/lib/audit-store";
import type { AuditEntry } from "@/lib/audit";

/*
 * The browser copy of the change log (hosted mode, or a failed file write) records each change under the
 * name the viewer provider set. The file route is not reachable here, so the fallback path is the one tested.
 */
const KEY = "kalos.audit.v1";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser copy: the actor recorded", () => {
  it("is the signed-in user's name when the viewer set it", async () => {
    setAuditActor("Ada Lovelace");
    recordAudit([{ action: "map.created", detail: 'Created process "Demo" with 0 steps.' }]);
    await flushAudit();
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]") as AuditEntry[];
    expect(saved).toHaveLength(1);
    expect(saved[0].actor).toBe("Ada Lovelace");
  });

  it("follows a later viewer, and never writes 'this device'", async () => {
    setAuditActor("Local mode, no sign-in");
    recordAudit([{ action: "step.added", detail: 'Added step "Mix".' }]);
    await flushAudit();
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]") as AuditEntry[];
    expect(saved.at(-1)?.actor).toBe("Local mode, no sign-in");
    expect(saved.map((e) => e.actor)).not.toContain("this device");
  });
});
