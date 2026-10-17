// Node-runtime half of instrumentation.ts.
//
// 1. Production boot check (lib/server/boot-check.ts): missing/placeholder
//    BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID/SECRET or engine
//    JWT key => log the variable NAMES (never values) and exit 1.
// 2. Auth DB migrations when AUTH_MIGRATE is set:
//      AUTH_MIGRATE=1    migrate, then serve
//      AUTH_MIGRATE=only migrate and exit 0 (one-shot job)
//      AUTH_MIGRATE=sql  print SQL and exit 0
//    Any failure (including a module-load error) exits 1: Next would
//    otherwise log "Failed to prepare server" and keep a one-shot job alive.
export async function registerNode(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  if (process.env.NODE_ENV === "production") {
    try {
      const { checkProductionBoot } = await import("./boot-check");
      const { errors, warnings } = await checkProductionBoot(process.env);
      for (const w of warnings) console.warn(`[kalos-boot] warning: ${w}`);
      if (errors.length) {
        for (const e of errors) console.error(`[kalos-boot] ${e}`);
        console.error("[kalos-boot] refusing to start: fix the configuration above (see env.example, docs/AUTH.md)");
        process.exit(1);
      }
    } catch (e) {
      console.error("[kalos-boot] boot check FAILED", e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  const mode = process.env.AUTH_MIGRATE;
  if (!mode) return;
  try {
    const { runAuthMigrateFromEnv } = await import("./auth-migrate");
    await runAuthMigrateFromEnv(mode);
  } catch (e) {
    console.error("[auth-migrate] FAILED", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
