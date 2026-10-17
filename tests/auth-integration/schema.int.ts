// The committed migrations/0001_better_auth.sql must match what this
// better-auth version generates for our config. Fails on upgrades that change
// the schema: review the diff, then regenerate (docs/AUTH.md).
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getMigrations } from "better-auth/db/migration";
import { describe, expect, it } from "vitest";
import { makeAuth } from "@/lib/server/auth-config.mjs";
import { BASE, GOOGLE_CLIENT_ID, TEST_SECRET } from "./helpers.mjs";

const norm = (s: string) =>
  s
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("--"))
    .map((l) => l.trim().replace(/;$/, ""))
    .join("\n");

describe("auth schema", () => {
  it("matches migrations/0001_better_auth.sql", async () => {
    const auth = makeAuth({ database: new Database(":memory:"), baseURL: BASE, secret: TEST_SECRET, googleClientId: GOOGLE_CLIENT_ID, googleClientSecret: "x", logger: { disabled: true } });
    const sql = await (await getMigrations(auth.options)).compileMigrations();
    const committed = fs.readFileSync(path.join(__dirname, "../../migrations/0001_better_auth.sql"), "utf8");
    expect(norm(sql)).toBe(norm(committed));
  });
});
