import "server-only";

// Better Auth schema migrations (additive only; getMigrations throws on
// unsafe changes). Driven by AUTH_MIGRATE from instrumentation.ts:
//   AUTH_MIGRATE=1    migrate, then serve
//   AUTH_MIGRATE=only migrate and exit 0 (one-shot job)
//   AUTH_MIGRATE=sql  print the SQL and exit 0 (review / commit to migrations/)
// Any failure exits 1.
import { getMigrations } from "better-auth/db/migration";
import { getAuth } from "@/lib/server/auth";

export async function migrateAuth({ dryRun = false } = {}) {
  const m = await getMigrations(getAuth().options);
  const plan = {
    create: m.toBeCreated.map((t) => t.table),
    add: m.toBeAdded.map((t) => `${t.table}(${Object.keys(t.fields).join(",")})`),
  };
  console.log("[auth-migrate] plan", JSON.stringify(plan));
  if (dryRun) {
    console.log(await m.compileMigrations());
    return plan;
  }
  await m.runMigrations();
  console.log("[auth-migrate] applied");
  return plan;
}

export async function runAuthMigrateFromEnv(mode: string): Promise<void> {
  if (!["1", "only", "sql"].includes(mode)) {
    console.error(`[auth-migrate] AUTH_MIGRATE must be 1, only or sql (got ${JSON.stringify(mode)})`);
    process.exit(1);
  }
  try {
    await migrateAuth({ dryRun: mode === "sql" });
  } catch (e) {
    console.error("[auth-migrate] FAILED", e instanceof Error ? e.message : e);
    process.exit(1);
  }
  if (mode === "only" || mode === "sql") process.exit(0);
}
