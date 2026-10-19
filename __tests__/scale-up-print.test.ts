import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("scale-up printable readout never opens a same-origin text/html document", () => {
  const src = readFileSync(path.resolve(__dirname, "../app/library/scale-up/page.tsx"), "utf8");

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
