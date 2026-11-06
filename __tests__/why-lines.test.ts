import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WHY, WHY_PREFIX, whyLine } from "@/lib/why";
import { CHECK_IDS } from "@/lib/validation";
import { FLAG_ORDER } from "@/components/campaign/plan-view";

/*
 * Every finding code, verdict state, flag, column status and refusal that the
 * app maps to words must carry a "Why this matters" line (lib/why.ts), so a
 * reader always learns what it means for the lab's work and what goes wrong
 * if it is ignored. The catalogs below are the places codes are mapped.
 */

const src = (p: string) => readFileSync(p, "utf8");
const keysOf = (file: string, re: RegExp): string[] => [...src(file).matchAll(re)].map((m) => m[1]);

const BANNED = /\b(held[- ]out|spearman|correlation|calibrat\w*|coverage|median|conformal|posterior|feasib\w*|engine|payload|schema|token|interval|significan\w*|surrogate|acquisition|explore|exploit)\b/i;

describe("why-lines", () => {
  it("covers every sheet-check id", () => {
    for (const id of CHECK_IDS) expect(whyLine(id), id).toBeTruthy();
  });
  it("covers every proposed-recipe flag", () => {
    for (const k of FLAG_ORDER) expect(whyLine(k), k).toBeTruthy();
  });
  it("covers every reliability state", () => {
    for (const s of ["reliable", "not-yet", "insufficient"]) expect(whyLine(s), s).toBeTruthy();
  });
  it("covers every promotion gate named in components/campaign/learn.ts", () => {
    for (const g of keysOf("components/campaign/learn.ts", /^\s+([a-z_]+): \{ reason:/gm)) expect(whyLine(g), g).toBeTruthy();
  });
  it("covers every refusal code in lib/engine-error.ts", () => {
    const codes = keysOf("lib/engine-error.ts", /^\s+([a-z_]+): \(/gm);
    expect(codes.length).toBeGreaterThan(5);
    for (const c of codes) expect(whyLine(c), c).toBeTruthy();
  });
  it("covers every column status in app/data/roles.ts", () => {
    const codes = keysOf("app/data/roles.ts", /^\s+([a-z_]+): "/gm);
    expect(codes.length).toBeGreaterThan(5);
    for (const c of codes) expect(whyLine(c), c).toBeTruthy();
  });
  it("is one plain sentence per code, in the lab's words", () => {
    for (const [code, line] of Object.entries(WHY)) {
      expect(line, code).toMatch(/^[A-Z].*[.]$/);
      expect(line, code).not.toMatch(BANNED);
      expect(line, code).not.toMatch(/\b(because it causes|drives|improves)\b/);
      expect(line.split(/[.;]\s/).length, `${code}: one idea per sentence`).toBeLessThanOrEqual(3);
    }
    expect(WHY_PREFIX).toBe("Why this matters:");
  });
  it("returns null for a code with no words, never a made-up line", () => {
    expect(whyLine("something_the_engine_invented")).toBeNull();
  });
});
