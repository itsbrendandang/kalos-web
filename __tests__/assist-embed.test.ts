import { describe, expect, it } from "vitest";
import { embedFor, fullPageFor, matchColumns, starterPrompts, type EmbedContext } from "@/lib/assist-embed";

const ctx: EmbedContext = { target: "Titer", inputs: ["SP", "Met", "Gly", "CarbonSource", "temperature_C"], hasDrivers: true, hasProposals: true };

describe("matchColumns", () => {
  it("matches whole column names as written, case-insensitively, with underscores read as spaces", () => {
    expect(matchColumns("show me titer by SP", ["SP", "Met", "Titer"])).toEqual(["SP", "Titer"]);
    expect(matchColumns("does temperature C matter?", ["temperature_C"])).toEqual(["temperature_C"]);
    expect(matchColumns("what about the spread", ["SP"])).toEqual([]);
  });
});

describe("embedFor", () => {
  it("draws the target against an input the question names", () => {
    expect(embedFor("Show me Titer by SP", ctx)).toEqual({ kind: "scatter", input: "SP", target: "Titer" });
    expect(embedFor("does Met matter?", ctx)).toEqual({ kind: "scatter", input: "Met", target: "Titer" });
  });
  it("draws the target in sheet order when only the target is named", () => {
    expect(embedFor("plot Titer", ctx)).toEqual({ kind: "order", target: "Titer" });
    expect(embedFor("what was the best titer?", ctx)).toEqual({ kind: "order", target: "Titer" });
  });
  it("ranks the inputs for 'which input matters most' and shows the recipes for 'what should I run next'", () => {
    expect(embedFor("Which input matters most?", ctx)).toEqual({ kind: "drivers" });
    expect(embedFor("What should I run next?", ctx)).toEqual({ kind: "recipes" });
  });
  it("draws nothing for a question that names no column and asks for no ranking or recipes", () => {
    expect(embedFor("What changed since last round?", ctx)).toBeNull();
    expect(embedFor("Which input matters most?", { ...ctx, hasDrivers: false })).toBeNull();
    expect(embedFor("plot Titer", { ...ctx, target: null })).toBeNull();
  });
});

describe("fullPageFor", () => {
  const next = { step: "Record the results.", why: "", action_route: "/campaign/record", blockers: [] };
  const answer = { answer: "x", sources: [{ kind: "round" as const, id: "0", quote: "q" }], abstained: false };
  it("sends a chart to the sheet's page, a ranking to Learn, recipes to Plan", () => {
    expect(fullPageFor({ question: "show Titer by SP", answer, embed: { kind: "scatter", input: "SP", target: "Titer" }, next, sheetSha: "a".repeat(64) })).toEqual({ href: `/data/sheet/${"a".repeat(64)}`, label: "See the full page: your sheet" });
    expect(fullPageFor({ question: "show Titer by SP", answer, embed: { kind: "scatter", input: "SP", target: "Titer" }, next, sheetSha: null }).href).toBe("/data");
    expect(fullPageFor({ question: "which input matters most", answer, embed: { kind: "drivers" }, next, sheetSha: null }).href).toBe("/campaign/learn");
    expect(fullPageFor({ question: "what should I run next", answer, embed: { kind: "recipes" }, next, sheetSha: null }).href).toBe("/campaign/plan");
  });
  it("sends trust and last-round questions to Learn, the next step to its stage, and anything else to the first source", () => {
    expect(fullPageFor({ question: "Why can't you trust the model yet?", answer, embed: null, next, sheetSha: null }).href).toBe("/campaign/learn");
    expect(fullPageFor({ question: "What changed since last round?", answer, embed: null, next, sheetSha: null }).href).toBe("/campaign/learn");
    expect(fullPageFor({ question: "What should I do next?", answer, embed: null, next, sheetSha: null })).toEqual({ href: "/campaign/record", label: "See the full page: Record" });
    expect(fullPageFor({ question: "Why is run 3 best?", answer, embed: null, next, sheetSha: null })).toEqual({ href: "/data/round/1", label: "See the full page: the round" });
    expect(fullPageFor({ question: "Anything?", answer: { ...answer, sources: [] }, embed: null, next, sheetSha: null }).href).toBe("/experiments");
  });
});

describe("starterPrompts", () => {
  const base = { next: null, target: "Titer", topInput: "SP", trusted: true, round: 1, hasBestRun: true, hasProposals: true };
  it("always starts with the next step, and adds the trust question only when the model is not trusted", () => {
    expect(starterPrompts(base)).toEqual(["What should I run next?", "Which input matters most?", "Show me Titer by SP", "Why is the best run best?"]);
    expect(starterPrompts({ ...base, trusted: false })[1]).toBe("Why can't you trust the model yet?");
    expect(starterPrompts({ ...base, next: { state: "fit_refused", step: "", why: "", action_route: "/campaign/setup", blockers: [] } })[1]).toBe("Why can't you trust the model yet?");
  });
  it("asks what changed only from the second round, and never more than five", () => {
    expect(starterPrompts({ ...base, round: 2, trusted: false })).toHaveLength(5);
    expect(starterPrompts({ ...base, round: 2 })).toContain("What changed since last round?");
    expect(starterPrompts({ ...base, round: 1 })).not.toContain("What changed since last round?");
    expect(starterPrompts({ next: null, target: null, topInput: null, trusted: null, round: null, hasBestRun: false, hasProposals: false })).toEqual(["What should I run next?"]);
  });
});
