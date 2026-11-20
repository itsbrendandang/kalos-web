// Secret guard (scripts/check_secrets.py, `npm run check:secrets`): a
// byte-identical copy of kalos-engine/scripts/check_secrets.py, where the full
// table-driven suite lives. These tests pin the wiring and the contract that
// matters here: hits are reported as `path:line (type)`, never with the value.
//
// Secret-shaped values are assembled at runtime so this file never contains one.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "../scripts/check_secrets.py");
const VALUE = "Ab3dE5gH7jK9mN1pQ3sT5vW7yZ9bC2eF4hJ6kL8";

function git(repo: string, ...args: string[]) {
  execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
}

function guard(repo: string, ...args: string[]) {
  return spawnSync("python3", [SCRIPT, "-C", repo, ...args], { encoding: "utf8" });
}

describe("scripts/check_secrets.py", () => {
  let repo: string;
  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), "check-secrets-"));
    git(repo, "init", "-q", "-b", "main");
    git(repo, "config", "user.email", "t@example.invalid");
    git(repo, "config", "user.name", "t");
    git(repo, "config", "commit.gpgsign", "false");
    writeFileSync(path.join(repo, "README.md"), "hello\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "init");
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("is wired as `npm run check:secrets` (range + staged + new file names)", () => {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
    expect(pkg.scripts["check:secrets"]).toBe("python3 scripts/check_secrets.py --range '@{u}..HEAD' --staged --paths");
  });

  it("passes a clean change", () => {
    writeFileSync(path.join(repo, "a.ts"), "export const ENGINE_TOKEN_AUDIENCE = \"kalos-engine\";\n");
    git(repo, "add", "a.ts");
    const r = guard(repo, "--staged", "--paths");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("flags a staged secret and a staged .env by path, line and type, never the value", () => {
    writeFileSync(path.join(repo, ".env"), "BETTER_AUTH" + "_SECRET=" + VALUE + "\n");
    writeFileSync(path.join(repo, "next.ts"), "const k = process.env.NEXT_PUBLIC" + "_ENGINE_TOKEN;\n");
    git(repo, "add", "-f", ".env", "next.ts");
    const r = guard(repo, "--staged", "--paths");
    expect(r.status).toBe(1);
    expect(r.stdout.trim().split("\n")).toEqual([
      ".env:0 (secret-bearing file name)",
      ".env:1 (named Kalos secret)",
      "next.ts:1 (secret behind NEXT_PUBLIC_)",
    ]);
    expect(r.stdout + r.stderr).not.toContain(VALUE);
  });

  it("fails closed (exit 2) when git cannot resolve the range", () => {
    const r = guard(repo, "--range", "no-such-ref..HEAD");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("failing closed");
  });
});
