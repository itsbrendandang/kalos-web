import "server-only";

// Production boot check, run from instrumentation.ts before the server takes
// traffic. Any error => the process logs every problem (names only, never
// values) and exits 1. There is deliberately no switch to skip it.
import { loadEngineSigner } from "@/lib/server/engine-token";
import { validateTenantMapFile } from "@/lib/server/tenants";

type Env = Readonly<Record<string, string | undefined>>;

export const REQUIRED_IN_PRODUCTION = [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "KALOS_ENGINE_JWT_PRIVATE_KEY_FILE",
  "KALOS_ENGINE_JWT_KID",
] as const;

// Values copied verbatim from env.example must never boot.
const PLACEHOLDER = /change[-_ ]?me|replace[-_ ]?me|placeholder|^<.*>$|^x+$|your[-_]/i;
const IP_OR_CIDR = /^(?:\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?|[0-9a-f:]+(?:\/\d{1,3})?)$/i;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface BootCheckResult {
  errors: string[];
  warnings: string[];
}

/** Synchronous checks on the environment. Pure (no I/O). */
export function checkEnv(env: Env): BootCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const name of REQUIRED_IN_PRODUCTION) {
    const v = env[name]?.trim();
    if (!v) errors.push(`${name} is not set`);
    else if (PLACEHOLDER.test(v)) errors.push(`${name} still holds the env.example placeholder`);
  }
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (secret && secret.length < 32) errors.push("BETTER_AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)");

  const url = env.BETTER_AUTH_URL?.trim();
  if (url) {
    let u: URL | null = null;
    try {
      u = new URL(url);
    } catch {
      errors.push("BETTER_AUTH_URL is not a valid URL");
    }
    if (u && u.protocol !== "https:" && !(u.protocol === "http:" && LOOPBACK.has(u.hostname))) {
      errors.push("BETTER_AUTH_URL must be https:// (http:// only for localhost)");
    }
    if (u && (u.pathname !== "/" || u.search || u.hash)) errors.push("BETTER_AUTH_URL must be an origin (no path, query or fragment)");
  }
  const pub = env.KALOS_PUBLIC_URL?.trim();
  if (pub && url) {
    try {
      if (new URL(pub).origin !== new URL(url).origin) warnings.push("KALOS_PUBLIC_URL and BETTER_AUTH_URL have different origins");
    } catch {
      errors.push("KALOS_PUBLIC_URL is not a valid URL");
    }
  }
  for (const p of (env.AUTH_TRUSTED_PROXIES ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!IP_OR_CIDR.test(p)) errors.push(`AUTH_TRUSTED_PROXIES entry is not an IP or CIDR: ${JSON.stringify(p)}`);
  }
  if (!env.KALOS_TENANT_MAP_FILE?.trim()) warnings.push("KALOS_TENANT_MAP_FILE is not set: every organization resolves to no tenant (403)");
  return { errors, warnings };
}

/** Full production check including the key file and tenant map (I/O). */
export async function checkProductionBoot(env: Env): Promise<BootCheckResult> {
  const r = checkEnv(env);
  if (env.KALOS_ENGINE_JWT_PRIVATE_KEY_FILE?.trim() && env.KALOS_ENGINE_JWT_KID?.trim()) {
    try {
      await loadEngineSigner(env);
    } catch (e) {
      r.errors.push(e instanceof Error ? e.message : "engine signing key could not be loaded");
    }
  }
  const map = env.KALOS_TENANT_MAP_FILE?.trim();
  if (map) {
    const problem = validateTenantMapFile(map);
    if (problem) r.errors.push(`KALOS_TENANT_MAP_FILE: ${problem}`);
  }
  return r;
}
