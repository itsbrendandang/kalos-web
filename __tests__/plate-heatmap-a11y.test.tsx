import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// Static-markup and contrast checks for the plate heatmap: every well needs a
// text name that does not depend on colour, and value text must meet WCAG AA
// on every fill. The same markup is run through axe-core in a real browser
// (docs/ACCESSIBILITY.md).

describe("plate heatmap well names", () => {
  it("every well button has an accessible name with id, value and flag; the flag is a labelled image", async () => {
    const { PlateHeatmap } = await import("@/components/plate/plate-heatmap");
    const { generatePlate } = await import("@/lib/plate-data");
    const plate = generatePlate(7);
    const wells = plate.wells;
    const values = Object.values(wells).map((w) => w.metrics.deltaOD);
    const html = renderToStaticMarkup(
      <PlateHeatmap
        wells={wells}
        deltaMin={Math.min(...values)}
        deltaMax={Math.max(...values)}
        selectedWellId="A1"
        onSelect={() => {}}
        showFlags
        showValues={false}
      />,
    );
    const wellButtons = html.match(/<button[^>]*aria-pressed[^>]*>/g) ?? [];
    expect(wellButtons.length).toBe(Object.keys(wells).length);
    for (const b of wellButtons) expect(b).toMatch(/aria-label="Well [A-H]\d+, [^"]*Δ OD -?\d\.\d{3}/);

    const flagged = Object.values(wells).filter((w) => w.flags.length > 0);
    expect(flagged.length).toBeGreaterThan(0);
    expect(html).toMatch(/role="img" aria-label="flagged"/);
  });

  it("a well with a value shows that value to screen readers even when the value text is hidden", async () => {
    const { PlateHeatmap } = await import("@/components/plate/plate-heatmap");
    const { generatePlate } = await import("@/lib/plate-data");
    const wells = generatePlate(7).wells;
    const [id, w] = Object.entries(wells)[0];
    const html = renderToStaticMarkup(
      <PlateHeatmap wells={{ [id]: w }} deltaMin={0} deltaMax={2} selectedWellId="" onSelect={() => {}} showFlags={false} showValues={false} />,
    );
    expect(html).toContain(`Δ OD ${w.metrics.deltaOD.toFixed(3)}`);
  });
});

describe("plate heatmap value text contrast", () => {
  // WCAG relative luminance and contrast, written out so the test does not
  // depend on the implementation it checks.
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const rgbHex = (css: string) => {
    const [r, g, b] = css.match(/\d+/g)!.map(Number);
    return [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  };

  it("the ink chosen for each well meets WCAG AA (4.5:1) against that well's fill", async () => {
    const { seqColor, seqInk } = await import("@/components/dashboard/heat-scale");
    for (let i = 0; i <= 200; i++) {
      const v = i / 200;
      const fill = lum(rgbHex(seqColor(v, 0, 1)));
      const ink = seqInk(v, 0, 1);
      expect(["#ffffff", "#000000"]).toContain(ink);
      const inkL = lum(ink);
      const hi = Math.max(fill, inkL);
      const lo = Math.min(fill, inkL);
      expect((hi + 0.05) / (lo + 0.05), `t=${v}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
