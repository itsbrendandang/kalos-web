import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The scale-up readout is JSON (POST /api/scale/readout.json). The old HTML
 * path (DOMParser scraping, srcdoc iframes, a print iframe) is gone for good:
 * nothing on the scale-up surfaces embeds or parses engine HTML, and printing
 * is the app's own page (window.print) with its print styles.
 */
describe("scale-up surfaces never embed or parse engine HTML", () => {
  const root = path.resolve(__dirname, "..");
  const dir = (d: string) =>
    readdirSync(path.join(root, d), { recursive: true, encoding: "utf8" })
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => path.join(root, d, f));
  const files = [
    ...dir("app/scale-up"),
    ...dir("app/campaigns/[id]/scale-up"),
    ...dir("components/scale"),
    path.join(root, "components/viz/charts/scale-ladder-chart.tsx"),
    path.join(root, "components/viz/charts/stage-gate-track.tsx"),
    path.join(root, "lib/scale-readout.ts"),
    path.join(root, "lib/viz-data/scale-ladder.ts"),
    path.join(root, "lib/viz-data/stage-gate.ts"),
  ];
  const src = files.map((f) => readFileSync(f, "utf8")).join("\n");

  it("no iframe, srcdoc, DOMParser or raw HTML injection", () => {
    expect(src).not.toMatch(/<iframe/);
    expect(src).not.toMatch(/srcdoc|srcDoc/);
    expect(src).not.toMatch(/DOMParser/);
    expect(src).not.toMatch(/dangerouslySetInnerHTML|innerHTML\s*=/);
  });

  it("no blob URL and no window.open", () => {
    expect(src).not.toMatch(/createObjectURL/);
    expect(src).not.toMatch(/new Blob\(/);
    expect(src).not.toMatch(/window\.open\(/);
  });

  it("the client calls the JSON route, never the HTML one", () => {
    const client = readFileSync(path.join(root, "lib/scale-readout.ts"), "utf8");
    expect(client).toMatch(/"\/api\/scale\/readout\.json"/);
    expect(client).not.toMatch(/\/api\/scale\/readout[`"']/);
  });
});
