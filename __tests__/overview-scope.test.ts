import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("campaign home pilot scope", () => {
  it("does not put the pilot root on auth, library, or project routes", () => {
    for (const file of ["app/sign-in/page.tsx", "app/library/page.tsx", "app/projects/page.tsx", "app/campaign/plan/page.tsx", "app/campaign/learn/page.tsx"]) {
      expect(read(file), file).not.toContain("campaign-overview");
    }
  });

  it("keeps new overview copy upright", () => {
    for (const file of [
      "components/campaign/overview/campaign-home.tsx",
      "components/campaign/overview/summary-strip.tsx",
      "components/campaign/overview/stage-panel.tsx",
      "components/campaign/overview/stage-tabs.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/italic|font-style:\s*italic/);
    }
  });
});
