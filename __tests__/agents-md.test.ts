// The agent and contributor rules ship with the repo. AGENTS.md keeps the
// Next.js block that `next dev` maintains byte-for-byte at the top, with the
// Kalos rules below it; CLAUDE.md imports AGENTS.md; no private paths are cited.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// next's own check: the block in AGENTS.md equals the one this next version writes.
import { hasCurrentAgentRules } from "next/dist/server/lib/generate-agent-files.js";

const ROOT = path.resolve(__dirname, "..");
const read = (name: string) => readFileSync(path.join(ROOT, name), "utf8");
const BEGIN = "<!-- BEGIN:nextjs-agent-rules -->";
const END = "<!-- END:nextjs-agent-rules -->";

describe("AGENTS.md / CLAUDE.md", () => {
  it("CLAUDE.md imports AGENTS.md", () => {
    expect(read("CLAUDE.md").trim()).toBe("@AGENTS.md");
  });

  it("keeps the Next.js block intact, first, and once", () => {
    const text = read("AGENTS.md");
    expect(hasCurrentAgentRules(ROOT)).toBe(true);
    expect(text.startsWith(BEGIN)).toBe(true);
    expect(text.split(BEGIN)).toHaveLength(2);
    expect(text.split(END)).toHaveLength(2);
  });

  it("puts the Kalos rules, agent context and team rules below the block", () => {
    const below = read("AGENTS.md").split(END)[1];
    const headings = [...below.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(
      expect.arrayContaining(["1. More real (honesty)", "2. Security", "5. Agent context", "6. Team rules"]),
    );
    expect(below).toContain("npm run lint");
  });

  it("cites no private paths", () => {
    for (const name of ["AGENTS.md", "CLAUDE.md"]) expect(read(name)).not.toContain(".kalos-dev");
  });
});
