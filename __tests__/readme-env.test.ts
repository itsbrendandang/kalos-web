import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * README.md's configuration tables and the code agree on every setting.
 *
 * Web server table ("### Web server"): every `KALOS_*`, `AUTH_*`,
 * `BETTER_AUTH_*`, `GOOGLE_*` and `NEXT_PUBLIC_*` name the server or client
 * code reads (process.env.X, env.X, env["X"], or a string that is exactly the
 * name, as in the production boot check's required list) must have a row, and
 * every row must name something the code reads. `HOSTNAME` and `PORT` are
 * Next's own and are listed too.
 *
 * Desktop shell table ("### Desktop shell"): the same for `std::env::var("X")`
 * in desktop/src-tauri/src/main.rs and `${X` in desktop/*.sh.
 */

const ROOT = join(__dirname, "..");
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const PREFIX = /^(KALOS|AUTH|BETTER_AUTH|GOOGLE|NEXT_PUBLIC)_[A-Z0-9_]+$/;
const EXTRA = new Set(["HOSTNAME", "PORT"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "target" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.(test|int)\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") && !name.endsWith(".d.mts")) out.push(p);
  }
  return out;
}

function webNamesInCode(): Set<string> {
  const files = ["app", "lib", "components", "hooks"].flatMap((d) => walk(join(ROOT, d)));
  for (const f of ["proxy.ts", "instrumentation.ts", "next.config.ts"]) files.push(join(ROOT, f));
  const found = new Set<string>();
  const keep = (n: string) => {
    if (PREFIX.test(n) || EXTRA.has(n)) found.add(n);
  };
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]+)/g)) keep(m[1]);
    for (const m of src.matchAll(/\benv(?:\(\))?\??\.([A-Z][A-Z0-9_]+)/g)) keep(m[1]);
    for (const m of src.matchAll(/\benv\[["']([A-Z][A-Z0-9_]+)["']\]/g)) keep(m[1]);
    for (const m of src.matchAll(/["']([A-Z][A-Z0-9_]+)["']/g)) if (PREFIX.test(m[1])) found.add(m[1]);
  }
  return found;
}

function shellNamesInCode(): Set<string> {
  const found = new Set<string>();
  const rust = readFileSync(join(ROOT, "desktop/src-tauri/src/main.rs"), "utf8");
  for (const m of rust.matchAll(/std::env::var\("(KALOS_[A-Z0-9_]+)"\)/g)) found.add(m[1]);
  for (const name of readdirSync(join(ROOT, "desktop"))) {
    if (!name.endsWith(".sh")) continue;
    const sh = readFileSync(join(ROOT, "desktop", name), "utf8");
    for (const m of sh.matchAll(/\$\{(KALOS_[A-Z0-9_]+)/g)) found.add(m[1]);
  }
  return found;
}

/** The names in the first cell of every row of the table under `heading`. */
function namesInTable(heading: string): Set<string> {
  const start = README.indexOf(heading);
  expect(start, `README.md has a "${heading}" section`).toBeGreaterThan(-1);
  const rest = README.slice(start + heading.length);
  const end = rest.search(/\n#{2,3} /);
  const section = end === -1 ? rest : rest.slice(0, end);
  const names = new Set<string>();
  for (const line of section.split("\n")) {
    if (!line.startsWith("| `")) continue;
    for (const m of line.split("|")[1].matchAll(/`([A-Z][A-Z0-9_]+)`/g)) names.add(m[1]);
  }
  expect(names.size, `the "${heading}" table has rows`).toBeGreaterThan(0);
  return names;
}

const diff = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();

describe("README configuration tables match the code", () => {
  it("every setting the web server or pages read is in the Web server table", () => {
    expect(diff(webNamesInCode(), namesInTable("### Web server"))).toEqual([]);
  });

  it("every row of the Web server table is a setting the code reads", () => {
    expect(diff(namesInTable("### Web server"), webNamesInCode())).toEqual([]);
  });

  it("every setting the desktop shell reads is in the Desktop shell table", () => {
    expect(diff(shellNamesInCode(), namesInTable("### Desktop shell"))).toEqual([]);
  });

  it("every row of the Desktop shell table is a setting the shell reads", () => {
    expect(diff(namesInTable("### Desktop shell"), shellNamesInCode())).toEqual([]);
  });
});
