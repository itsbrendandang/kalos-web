import { describe, expect, it } from "vitest";
import { EngineError, engineMessage, errorMessage } from "@/lib/engine-error";

const CODES = [
  "payload_too_large",
  "unauthenticated",
  "rate_limited",
  "engine_busy",
  "engine_error",
  "engine_unreachable",
  "engine_timeout",
  "engine_auth_failed",
  "campaign_has_runs",
  "too_few_rows",
  "too_few_complete_rows",
  "target_constant",
  "ambiguous_header",
  "sheet_not_found",
];

describe("engineMessage: plain copy for every known code", () => {
  for (const code of CODES) {
    it(`${code} has a sentence and never shows the raw code`, () => {
      const m = engineMessage({ code });
      expect(m.message.length).toBeGreaterThan(20);
      expect(m.message).not.toContain(code);
      expect(m.message).not.toMatch(/_/);
    });
  }

  it("only an expired session asks for sign-in", () => {
    for (const code of CODES) expect(engineMessage({ code }).signIn, code).toBe(code === "unauthenticated");
  });

  it("payload_too_large names the limit when the proxy sent it", () => {
    expect(engineMessage({ code: "payload_too_large", limitMb: 25 }).message).toContain("25 MB");
    expect(engineMessage({ code: "payload_too_large" }).message).not.toContain("MB limit.");
  });

  it("a bare code in `error` (how the proxy sends its own failures) gets the same copy as `code`", () => {
    expect(engineMessage({ error: "engine_busy" })).toEqual(engineMessage({ code: "engine_busy" }));
  });
});

describe("engineMessage: unknown input", () => {
  it("an unknown code gets the generic sentence, not the code", () => {
    const m = engineMessage({ code: "some_new_thing" });
    expect(m.message).not.toContain("some_new_thing");
    expect(m.message).toMatch(/could not use this file/);
  });

  it("an unknown bare code in `error` is treated as a code, not shown", () => {
    expect(engineMessage({ error: "weird_upstream_code" }).message).not.toContain("weird_upstream_code");
  });

  it("a human sentence from the engine is shown as it is", () => {
    expect(engineMessage({ error: "no target column" }).message).toBe("no target column");
  });

  it("nothing at all gets the generic sentence", () => {
    expect(engineMessage({}).message).toMatch(/could not use this file/);
    expect(engineMessage({ error: "   " }).message).toMatch(/could not use this file/);
  });
});

describe("errorMessage: anything thrown", () => {
  it("maps a typed EngineError by its code", () => {
    expect(errorMessage(new EngineError(503, "engine_busy"))).toEqual(engineMessage({ code: "engine_busy" }));
    expect(errorMessage(new EngineError(401, "unauthenticated")).signIn).toBe(true);
  });

  it("an unexpected failure (a bug, a dropped connection) gets the service-did-not-respond sentence", () => {
    expect(errorMessage(new TypeError("boom")).message).toBe("The analysis service did not respond. Try again in a moment.");
    expect(errorMessage("not an error").signIn).toBe(false);
  });
});
