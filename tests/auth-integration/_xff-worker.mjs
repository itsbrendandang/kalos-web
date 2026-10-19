// Run with NODE_ENV=production. Drives the REAL auth handler (makeAuth with
// the env-derived proxy settings) and rotates X-Forwarded-For on every request.
// argv: n  -> prints the status codes as JSON.
import { getMigrations } from "better-auth/db/migration";
import { authOptionsFromEnv, makeAuth } from "../../lib/server/auth-config.mjs";
import { BASE, client, GOOGLE_CLIENT_ID, openDb, TEST_SECRET } from "./helpers.mjs";

const [file, n] = process.argv.slice(2);
const opts = authOptionsFromEnv(process.env);
const auth = makeAuth({
  ...opts,
  database: openDb(file),
  baseURL: BASE,
  secret: TEST_SECRET,
  googleClientId: GOOGLE_CLIENT_ID,
  googleClientSecret: "fake-secret",
  logger: { disabled: true },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 100, customRules: { "/sign-in/social": { window: 60, max: 3 } } },
});
await (await getMigrations(auth.options)).runMigrations();
const out = [];
for (let i = 0; i < +n; i++) {
  // A different spoofed client address on every request.
  const spoofed = `198.51.100.${(i % 250) + 1}`;
  out.push((await client(auth, { ip: spoofed }).req("/sign-in/social", { method: "POST", body: { provider: "google" } })).status);
}
console.log(JSON.stringify(out));
