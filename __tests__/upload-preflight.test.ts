import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, preflightFile } from "@/lib/upload-preflight";

describe("upload preflight", () => {
  it("accepts supported sheets under the cap, case-insensitively", () => {
    for (const name of ["a.csv", "a.TSV", "run sheet.xlsx", "x.XLS"]) {
      expect(preflightFile({ name, size: 1000 })).toBeNull();
    }
    expect(preflightFile({ name: "a.csv", size: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it("rejects wrong extensions, empty files and oversize files with a message", () => {
    expect(preflightFile({ name: "a.exe", size: 10 })).toMatch(/not a supported file type/);
    expect(preflightFile({ name: "noext", size: 10 })).toMatch(/not a supported file type/);
    expect(preflightFile({ name: "a.csv.zip", size: 10 })).toMatch(/not a supported file type/);
    expect(preflightFile({ name: "a.csv", size: 0 })).toMatch(/empty/);
    expect(preflightFile({ name: "big.csv", size: MAX_UPLOAD_BYTES + 1 })).toMatch(/limit is 25 MB/);
  });

  it("is wired into both dropzones, and scale-up only peeks at the header", () => {
    const root = path.resolve(__dirname, "..");
    for (const f of ["components/upload-dropzone.tsx", "components/campaign/upload-zone.tsx"]) {
      expect(readFileSync(path.join(root, f), "utf8")).toContain("preflightFile");
    }
    const page = readFileSync(path.join(root, "app/library/scale-up/page.tsx"), "utf8");
    expect(page).not.toMatch(/await f\.text\(\)/);
    expect(page).toContain("f.slice(0, HEADER_PEEK_BYTES)");
  });
});

describe("env.example", () => {
  it("never sets a non-empty KALOS_ENGINE_TOKEN (a copied placeholder would 401 as a wrong token)", () => {
    const text = readFileSync(path.resolve(__dirname, "../env.example"), "utf8");
    const active = text.split("\n").filter((l) => /^\s*KALOS_ENGINE_TOKEN\s*=\s*\S/.test(l));
    expect(active).toEqual([]);
    expect(text).toMatch(/^# KALOS_ENGINE_TOKEN=/m);
  });
});
