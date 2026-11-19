import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("scale-up printable readout never opens a same-origin text/html document", () => {
  // The page and every scale-up component it renders (the readout view and its print helper live in components/scale).
  const scaleDir = path.resolve(__dirname, "../components/scale");
  const files = [
    path.resolve(__dirname, "../app/scale-up/page.tsx"),
    ...readdirSync(scaleDir)
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => path.join(scaleDir, f)),
  ];
  const src = files.map((f) => readFileSync(f, "utf8")).join("\n");

  it("no blob URL and no window.open of the readout", () => {
    expect(src).not.toMatch(/createObjectURL/);
    expect(src).not.toMatch(/new Blob\(/);
    expect(src).not.toMatch(/window\.open\(/);
  });

  it("every iframe that carries readout HTML is sandboxed without allow-same-origin", () => {
    const frames = src.match(/<iframe[\s\S]*?\/>/g) ?? [];
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(f).toMatch(/sandbox=/);
      expect(f).not.toMatch(/allow-same-origin/);
    }
    expect(src).toMatch(/setAttribute\("sandbox", "allow-scripts"\)/);
    expect(src).not.toMatch(/allow-same-origin/);
  });
});
