import { describe, expect, it } from "vitest";
import spec from "./fixtures/engine-openapi.json";
import { CONTRACT_HEADER, EXPECTED_ENGINE_CONTRACT, MIN_ENGINE_CONTRACT, contractStatus } from "@/lib/contract";
import { ENGINE_ROUTES } from "@/lib/server/engine-routes";

// The fixture is a copy of kalos-engine docs/openapi.json (scripts/export_openapi.py).
type Spec = { info: Record<string, unknown>; paths: Record<string, Record<string, unknown>> };
const engine = spec as unknown as Spec;

// Proxy routes served by engine branches that are not merged into the spec yet.
// May only shrink: when the engine spec gains a route, drop it from here.
const NOT_YET_IN_ENGINE_SPEC = ["api/assist/"];

const segmentsMatch = (pattern: readonly string[], specPath: string): boolean => {
  const parts = specPath.replace(/^\//, "").split("/");
  return parts.length === pattern.length && pattern.every((seg, i) => (seg === ":id" ? /^\{[^}]+\}$/.test(parts[i]) : seg === parts[i]));
};

describe("engine contract version (lib/contract.ts)", () => {
  it("matches the version recorded in the engine spec", () => {
    expect(engine.info["x-kalos-contract"]).toBe(EXPECTED_ENGINE_CONTRACT);
    expect(MIN_ENGINE_CONTRACT).toBeLessThanOrEqual(EXPECTED_ENGINE_CONTRACT);
    expect(CONTRACT_HEADER).toBe("X-Kalos-Contract");
  });

  it("classifies what the engine reports", () => {
    expect(contractStatus(EXPECTED_ENGINE_CONTRACT)).toBe("ok");
    expect(contractStatus(String(EXPECTED_ENGINE_CONTRACT))).toBe("ok");
    expect(contractStatus(MIN_ENGINE_CONTRACT - 1)).toBe("engine-too-old");
    expect(contractStatus(EXPECTED_ENGINE_CONTRACT + 1)).toBe("engine-newer");
    for (const bad of [undefined, null, "", "three", 2.5, 0]) expect(contractStatus(bad)).toBe("unknown");
  });

  it("every proxied engine route exists in the engine spec with the same method", () => {
    const missing = ENGINE_ROUTES.filter((r) => !NOT_YET_IN_ENGINE_SPEC.some((p) => r.pattern.join("/").startsWith(p)))
      .filter((r) => !Object.entries(engine.paths).some(([path, ops]) => segmentsMatch(r.pattern, path) && r.method.toLowerCase() in ops))
      .map((r) => `${r.method} /${r.pattern.join("/")}`);
    expect(missing).toEqual([]);
  });

  it("the not-yet-in-spec list only holds routes the spec really lacks", () => {
    const covered = NOT_YET_IN_ENGINE_SPEC.filter((prefix) => Object.keys(engine.paths).some((p) => p.replace(/^\//, "").startsWith(prefix)));
    expect(covered).toEqual([]);
  });
});
