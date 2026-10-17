import "server-only";

// SQLite handle for Better Auth (better-sqlite3 13.0.3, prebuilt N-API binary,
// installed with --ignore-scripts). One process owns the file: kalos-web runs
// as a SINGLE replica (docs/AUTH.md "Limits").
//
// - AUTH_DB_PATH (default ./data/auth.db; /data/auth.db in the image, a
//   mounted volume). Parent dir created 0700, db/-wal/-shm created 0600.
// - WAL + busy_timeout so the online backup sidecar and the app coexist.
// - `next build` evaluates route modules while collecting page data: during
//   the build phase the handle is an in-memory database, never the real file.
import fs from "node:fs";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";

export const BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";

export function authDbPath(env: Readonly<Record<string, string | undefined>> = process.env): string {
  if (env.NEXT_PHASE === "phase-production-build") return ":memory:";
  return env.AUTH_DB_PATH?.trim() || path.join(process.cwd(), "data", "auth.db");
}

export function openAuthDb(file: string = authDbPath()): BetterSqlite3.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const prev = process.umask(0o077);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof BetterSqlite3;
    const db = new Database(file);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    db.pragma("synchronous = NORMAL");
    return db;
  } finally {
    process.umask(prev);
  }
}

const g = globalThis as unknown as { __kalosAuthDb?: BetterSqlite3.Database };

/** The process-wide handle (survives dev hot reloads). */
export function authDb(): BetterSqlite3.Database {
  return (g.__kalosAuthDb ??= openAuthDb());
}
