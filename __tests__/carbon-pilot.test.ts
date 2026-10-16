import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mockSurface, toHeatmapData } from "@/lib/pilot/mock-surface";

describe("carbon pilot", () => {
  it("mock payload is 21x21 with the agreed shape", () => {
    const s = mockSurface();
    expect(s.x_vals).toHaveLength(21);
    expect(s.y_vals).toHaveLength(21);
    expect(s.z).toHaveLength(21);
    expect(s.z.every((row) => row.length === 21)).toBe(true);
    expect(s.std.flat().every((v) => v > 0)).toBe(true);
    expect(s.proposals).toHaveLength(2);
    expect(toHeatmapData(s)).toHaveLength(441);
  });

  it("only the pilot layout imports Carbon styles, and the stylesheet is scoped", () => {
    const root = path.resolve(__dirname, "..");
    const scss = readFileSync(path.join(root, "app/pilot/carbon/carbon-scope.scss"), "utf8");
    expect(scss).toMatch(/\.carbon-pilot\s*\{[\s\S]*load-css\('@carbon\/react'/);
    expect(readFileSync(path.join(root, "app/layout.tsx"), "utf8")).not.toMatch(/carbon/i);
    expect(readFileSync(path.join(root, "app/globals.css"), "utf8")).not.toMatch(/carbon|cds--/i);
  });
});
