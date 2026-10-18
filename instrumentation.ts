// Runs once when the Next server starts. All logic lives in
// lib/server/instrumentation-node.ts (Node runtime only):
//   1. production boot check - missing/placeholder auth or engine-key
//      configuration => exit 1 (no skip switch);
//   2. AUTH_MIGRATE=1|only|sql auth DB migrations, failures exit 1.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./lib/server/instrumentation-node");
    await registerNode();
  }
}
