import { afterEach, describe, expect, it, vi } from "vitest";
import { canAsk, getAssistNext, getDefaultCampaignId, safeActionRoute } from "@/lib/assist";
import { describeEngineError, engineError, EngineError, kindFor, parseErrorBody } from "@/lib/engine-error";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("engine errors", () => {
  it("reads every generation of error body", () => {
    expect(parseErrorBody({ error: "busy", code: "engine_busy" })).toEqual({ message: "busy", code: "engine_busy" });
    expect(parseErrorBody({ error: "bad sheet" })).toEqual({ message: "bad sheet", code: null });
    expect(parseErrorBody({ detail: "Not authenticated" })).toEqual({ message: "Not authenticated", code: null });
    expect(parseErrorBody({ detail: [{ loc: ["body"] }] })).toEqual({ message: null, code: null });
    expect(parseErrorBody("nope")).toEqual({ message: null, code: null });
  });

  it("classifies by status, so a proxy timeout is never shown as a bad request", () => {
    expect(kindFor(502)).toBe("unreachable");
    expect(kindFor(504)).toBe("unreachable");
    expect(kindFor(503)).toBe("busy");
    expect(kindFor(401)).toBe("auth");
    expect(kindFor(409)).toBe("conflict");
    expect(kindFor(400)).toBe("rejected");
    expect(kindFor(422)).toBe("rejected");
    expect(kindFor(500)).toBe("server");
  });

  it("keeps code and Retry-After from the response", async () => {
    const e = await engineError(json(503, { error: "An analysis is already running.", code: "engine_busy" }, { "retry-after": "7" }));
    expect(e).toBeInstanceOf(EngineError);
    expect([e.kind, e.code, e.retryAfter, e.message]).toEqual(["busy", "engine_busy", 7, "An analysis is already running."]);
    expect(describeEngineError(e)).toMatch(/about 7 s/);
  });

  it("survives a non-JSON body", async () => {
    const e = await engineError(new Response("<html>", { status: 502 }));
    expect([e.kind, e.message]).toEqual(["unreachable", "engine responded 502"]);
    expect(describeEngineError(e)).toMatch(/may still be working/);
  });

  it("describes a non-engine failure as a connection problem", () => {
    expect(describeEngineError(new TypeError("fetch failed"))).toMatch(/did not respond/);
  });
});

describe("assist client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("only links engine steps to routes the web has", () => {
    expect(safeActionRoute("/campaign/record")).toBe("/campaign/record");
    expect(safeActionRoute("/campaign/learn")).toBe("/campaign/learn");
    expect(safeActionRoute("https://evil.example")).toBeNull();
    expect(safeActionRoute("/campaign/record/../../x")).toBeNull();
    expect(safeActionRoute("/settings")).toBeNull();
    expect(safeActionRoute(null)).toBeNull();
  });

  it("offers Ask only when a model provider is configured", () => {
    expect(canAsk(null)).toBe(false);
    expect(canAsk({ provider: "none", model: null, local: true })).toBe(false);
    expect(canAsk({ provider: "ollama", model: "phi4-mini", local: true })).toBe(true);
  });

  it("treats a missing route (older engine) as null, and other failures as errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(404, { error: "not found", code: "not_found" })));
    await expect(getAssistNext()).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(503, { error: "busy", code: "engine_busy" })));
    await expect(getAssistNext()).rejects.toBeInstanceOf(EngineError);
  });

  it("picks the default, unarchived campaign id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        json(200, { campaigns: [{ id: "cmp_old", is_default: false }, { id: "cmp_a", is_default: true, archived: false }] }),
      ),
    );
    await expect(getDefaultCampaignId()).resolves.toBe("cmp_a");
  });
});

describe("sourceLabel", () => {
  it("reads engine source ids in plain words, rounds 1-based", async () => {
    const { sourceLabel } = await import("@/components/workbench/context-panel");
    expect(sourceLabel("row", "row:42")).toBe("Row 42");
    expect(sourceLabel("round", "1")).toBe("Round 2");
    expect(sourceLabel("column", "temperature_C")).toBe("Column temperature_C");
    expect(sourceLabel("doc_chunk", "ASSISTANT.md#3")).toBe("Doc chunk ASSISTANT.md#3");
  });
});
