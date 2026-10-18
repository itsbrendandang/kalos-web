import "server-only";

// Auth-provider organization id (SessionContext.orgId) -> stable internal
// Kalos tenant id.
//
// The engine scopes every stored campaign by `tenant`. That value must come
// from a server-side mapping the operator controls - never from the client
// (no header, query, body or cookie is ever consulted) and never derived by
// string-munging the provider's org id, so renaming or re-creating an org in
// the auth provider (or switching providers) cannot silently re-point it at
// someone else's data: the operator re-maps explicitly.
//
// Fail closed: an org that is not in the map resolves to null, the caller
// answers 403, and the engine is never called. A map that is missing,
// unreadable, not a flat JSON object of strings, or that contains any tenant
// id outside the engine's own format is rejected as a whole (resolves null
// for everyone) rather than partially trusted.
import { readFileSync, statSync } from "node:fs";

/** The engine's tenant id format (kalos/portal/auth.py). Reject, never sanitise. */
export const TENANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/**
 * Shape accepted for a provider org id before it is looked up. Deliberately
 * provider-neutral (Better Auth ids, WorkOS `org_...` ids, UUIDs all fit);
 * anything else is never looked up.
 */
export const ORG_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export interface TenantResolver {
  resolveTenant(orgId: string): Promise<string | null>;
}

export class TenantMapError extends Error {}

/** Parse and validate a tenant map document. Throws TenantMapError on anything unexpected. */
export function parseTenantMap(raw: string): Map<string, string> {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new TenantMapError("tenant map is not valid JSON");
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new TenantMapError("tenant map must be a JSON object of { \"<provider org id>\": \"tenant-id\" }");
  }
  const map = new Map<string, string>();
  for (const [orgId, tenant] of Object.entries(doc as Record<string, unknown>)) {
    if (!ORG_ID_PATTERN.test(orgId)) throw new TenantMapError(`tenant map key is not a valid org id: ${JSON.stringify(orgId)}`);
    if (typeof tenant !== "string" || !TENANT_ID_PATTERN.test(tenant)) {
      throw new TenantMapError(`tenant id for ${orgId} must match ${TENANT_ID_PATTERN}`);
    }
    map.set(orgId, tenant);
  }
  return map;
}

/** Validate a map file without throwing; used by the boot check. */
export function validateTenantMapFile(path: string): string | null {
  try {
    parseTenantMap(readFileSync(path, "utf8"));
    return null;
  } catch (err) {
    return err instanceof TenantMapError ? err.message : "tenant map file is not readable";
  }
}

/**
 * Default resolver: the JSON file named by KALOS_TENANT_MAP_FILE, re-read
 * when its mtime/size/inode/ctime change (so the operator can add an org without a restart).
 */
export function fileTenantResolver(getPath: () => string | undefined = () => process.env.KALOS_TENANT_MAP_FILE): TenantResolver {
  let cache: { path: string; key: string; map: Map<string, string> | null } | null = null;

  function load(): Map<string, string> | null {
    const path = getPath()?.trim();
    if (!path) return null;
    let key: string;
    try {
      // mtime alone is spoofable/coarse (in-place rewrite, same mtime); a stale
      // org->tenant map is a cross-tenant risk, so key on more of the inode state.
      const st = statSync(path);
      key = `${st.mtimeMs}:${st.size}:${st.ino}:${st.ctimeMs}`;
    } catch {
      cache = null;
      return null;
    }
    if (cache && cache.path === path && cache.key === key) return cache.map;
    let map: Map<string, string> | null;
    try {
      map = parseTenantMap(readFileSync(path, "utf8"));
    } catch (err) {
      // Logged without the file contents; the boot check reports the detail.
      console.error(`[kalos-auth] tenant map rejected: ${err instanceof Error ? err.message : "unreadable"}`);
      map = null;
    }
    cache = { path, key, map };
    return map;
  }

  return {
    async resolveTenant(orgId: string): Promise<string | null> {
      if (typeof orgId !== "string" || !ORG_ID_PATTERN.test(orgId)) return null;
      return load()?.get(orgId) ?? null;
    },
  };
}

let defaultResolver: TenantResolver | null = null;

/** The process-wide resolver (file-backed). */
export function resolveTenant(orgId: string): Promise<string | null> {
  defaultResolver ??= fileTenantResolver();
  return defaultResolver.resolveTenant(orgId);
}
