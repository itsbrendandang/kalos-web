// One "replica": its own process on a shared DB file. argv: storage file n
import { getMigrations } from "better-auth/db/migration";
import { makeAuth } from "../../lib/server/auth-config.mjs";
import { BASE, client, GOOGLE_CLIENT_ID, openDb, TEST_SECRET } from "./helpers.mjs";

const [storage, file, n] = process.argv.slice(2);
const auth = makeAuth({
  database: openDb(file),
  baseURL: BASE,
  secret: TEST_SECRET,
  googleClientId: GOOGLE_CLIENT_ID,
  googleClientSecret: "fake-secret",
  logger: { disabled: true },
  rateLimit: { enabled: true, storage, window: 60, max: 100, customRules: { "/sign-in/social": { window: 60, max: 3 } } },
});
await (await getMigrations(auth.options)).runMigrations();
const out = [];
for (let i = 0; i < +n; i++) {
  out.push((await client(auth, { ip: "203.0.113.7" }).req("/sign-in/social", { method: "POST", body: { provider: "google" } })).status);
}
console.log(JSON.stringify(out));
