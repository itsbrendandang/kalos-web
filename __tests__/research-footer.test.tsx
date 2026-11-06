// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { RESEARCH_LINE, ResearchFooter } from "@/components/brand/research-footer";

afterEach(cleanup);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}

/*
 * First-time study, F19: no Greek proverbs anywhere, and the research line once per page in the page
 * footer ("Suggestions are ideas to test in the lab, not settings"), with the sidebar saying only
 * "Research use only".
 */
describe("the page footer", () => {
  it("is one plain line", () => {
    render(<ResearchFooter />);
    expect(screen.getByRole("contentinfo").textContent).toBe(`Research use only. ${RESEARCH_LINE}`);
    expect(RESEARCH_LINE).toBe("Suggestions are ideas to test in the lab, not settings.");
  });
  it("no Greek maxim or Greek-key rule is left in the app", () => {
    const src = [...files("app"), ...files("components"), ...files("lib")].map((p) => readFileSync(p, "utf8")).join("\n");
    expect(src).not.toMatch(/Γνῶθι|Μηδὲν|Μέτρον|Ὅρα|maximFor|greek-key|GreekKey|hypotheses to test/);
  });
  it("the sidebar says only 'Research use only', so the sentence is on the page once", () => {
    const sidebar = readFileSync("components/workbench/sidebar.tsx", "utf8");
    expect(sidebar).toContain(">Research use only.</p>");
    expect(sidebar).not.toContain("not settings");
  });
});
