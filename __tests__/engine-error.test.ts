import { describe, expect, it } from "vitest";
import { EngineError, engineMessage, errorMessage, LEARN_FALLBACK, learnFailure } from "@/lib/engine-error";

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

describe("fit-row cap (the engine's uncoded refusal over N complete rows)", () => {
  const CAP_SENTENCE =
    "The dataset is too large for the surrogate; the optimizer targets the small-sample regime, N<=2000.";

  it("reads the cap from the engine sentence and gives plain copy with the number and a next step", () => {
    const m = engineMessage({ error: CAP_SENTENCE });
    expect(m.message).toContain("2,000 complete rows");
    expect(m.message).toMatch(/upload a smaller sheet/i);
    expect(m.message).toMatch(/raise the row limit/i);
    expect(m.message).not.toMatch(/surrogate|N<=|optimizer|small-sample/);
    expect(m.signIn).toBe(false);
  });

  it("still gives plain copy when the engine's sentence has no number", () => {
    const m = engineMessage({ error: "The dataset is too large for the surrogate." });
    expect(m.message).toMatch(/a fixed number of complete rows/);
    expect(m.message).not.toMatch(/surrogate/);
  });

  it("an EngineError that carries the engine sentence gets the same copy", () => {
    expect(errorMessage(new EngineError(400, "", undefined, CAP_SENTENCE))).toEqual(engineMessage({ error: CAP_SENTENCE }));
  });

  it("a code wins over the sentence, and an unrelated sentence is still shown as it is", () => {
    expect(engineMessage({ code: "target_constant", error: CAP_SENTENCE }).message).toMatch(/never changes/);
    expect(engineMessage({ error: "no target column" }).message).toBe("no target column");
  });

  it("does not treat prototype names as codes", () => {
    expect(engineMessage({ code: "constructor" }).message).toMatch(/could not use this file/);
  });
});

/*
 * Learn's failure state (Phase 0a follow-up): the plain reason first; the engine's own words only in
 * `engineText`, for a secondary "Engine message" line. Engine vocabulary never becomes the reason.
 */
describe("learnFailure: plain reason first, engine words kept aside", () => {
  const CAP = "The dataset is too large for the surrogate; the optimizer targets the small-sample regime, N<=2000.";
  it("maps the row-cap sentence to plain copy and keeps the sentence for the disclosure", () => {
    const m = learnFailure(new EngineError(400, "", undefined, CAP));
    expect(m.message).toContain("2,000 complete rows");
    expect(m.message).not.toMatch(/surrogate|N<=|optimizer|small-sample/);
    expect(m.engineText).toBe(CAP);
  });
  it("replaces an unmapped engine sentence with plain copy, and keeps the sentence", () => {
    const raw = "The engine returned an unexpected score matrix for the surrogate.";
    const m = learnFailure(new EngineError(500, "", undefined, raw));
    expect(m.message).toBe(LEARN_FALLBACK);
    expect(m.message).not.toMatch(/surrogate/);
    expect(m.engineText).toBe(raw);
  });
  it("with no sentence at all, uses the Learn fallback, not the upload wording", () => {
    const m = learnFailure(new EngineError(500, "some_new_thing"));
    expect(m).toEqual({ message: LEARN_FALLBACK, signIn: false, engineText: null });
    expect(m.message).not.toMatch(/use this file/);
  });
  it("never shows a bare machine code in either line", () => {
    const m = learnFailure(new EngineError(500, "", undefined, "weird_upstream_code"));
    expect(m.message).toBe(LEARN_FALLBACK);
    expect(m.engineText).toBeNull();
  });
  it("a known code keeps its plain copy and does not show the code", () => {
    const m = learnFailure(new EngineError(503, "engine_busy"));
    expect(m.message).toBe(engineMessage({ code: "engine_busy" }).message);
    expect(m.engineText ?? "").not.toMatch(/engine_busy/);
  });
  it("an unexpected failure (network, bug) gets the did-not-respond copy", () => {
    expect(learnFailure(new TypeError("boom"))).toEqual({ message: "The analysis service did not respond. Try again in a moment.", signIn: false, engineText: null });
  });
  it("an expired session still asks for sign-in", () => {
    expect(learnFailure(new EngineError(401, "unauthenticated")).signIn).toBe(true);
  });
});

