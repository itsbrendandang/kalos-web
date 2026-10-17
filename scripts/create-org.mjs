#!/usr/bin/env node
// Operator CLI: controlled onboarding of a NEW organization.
//
// Creates, in one SQLite transaction on the Better Auth database:
//   - the organization (users cannot create organizations themselves),
//   - a pending "owner" invitation for the first owner's email,
// then adds { "<org id>": "<tenant id>" } to the tenant map JSON
// (KALOS_TENANT_MAP_FILE, read by lib/server/tenants.ts) and prints the
// /accept-invite/<id> link for the operator to send by hand (no email).
//
// It never edits or renames an existing tenant-map entry and refuses a tenant
// id that is already mapped to another organization (two orgs on one tenant
// would share campaign data).
//
//   node scripts/create-org.mjs --name "Acme Bio" --slug acme \
//     --owner-email owner@acme.example --tenant acme \
//     [--db /data/auth.db] [--tenant-map /config/tenants.json] \
//     [--public-url https://kalos.example.com] [--expires-days 7] [--dry-run]
//
// Defaults: --db $AUTH_DB_PATH (./data/auth.db), --tenant-map
// $KALOS_TENANT_MAP_FILE, --public-url $KALOS_PUBLIC_URL or $BETTER_AUTH_URL.
// Run AUTH_MIGRATE=only first. Docker: docs/AUTH.md "Onboarding an organization".
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import Database from "better-sqlite3";

// Same formats as lib/server/tenants.ts (kept in sync by __tests__/create-org.test.ts).
const TENANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ORG_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SYSTEM_USER_ID = "kalos-system";
const SYSTEM_USER_EMAIL = "system@kalos.invalid"; // .invalid: no Google account can ever hold it

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** 32-char id, same shape as Better Auth's default generateId. */
export function newId(len = 32) {
  const out = [];
  while (out.length < len) {
    for (const b of randomBytes(len * 2)) {
      if (b < 248 && out.length < len) out.push(ALPHABET[b % 62]); // 248 = 4*62: unbiased
    }
  }
  return out.join("");
}

class UsageError extends Error {}

function readTenantMap(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw new UsageError(`cannot read tenant map ${file}: ${e.code ?? e.message}`);
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new UsageError(`tenant map ${file} is not valid JSON`);
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) throw new UsageError(`tenant map ${file} must be a JSON object`);
  for (const [k, v] of Object.entries(doc)) {
    if (!ORG_ID_PATTERN.test(k) || typeof v !== "string" || !TENANT_ID_PATTERN.test(v)) {
      throw new UsageError(`tenant map ${file} has an invalid entry for ${JSON.stringify(k)}; fix it first`);
    }
  }
  return doc;
}

export function createOrg(opts, log = console.log) {
  const name = String(opts.name ?? "").trim();
  const slug = String(opts.slug ?? "").trim();
  const email = String(opts.ownerEmail ?? "").trim().toLowerCase();
  const tenant = String(opts.tenant ?? "").trim();
  const days = Number(opts.expiresDays ?? 7);
  if (!name || name.length > 100) throw new UsageError("--name is required (max 100 chars)");
  if (!SLUG_PATTERN.test(slug)) throw new UsageError("--slug must be lowercase letters, digits and dashes (2-48 chars)");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new UsageError("--owner-email is not a valid email address");
  if (!TENANT_ID_PATTERN.test(tenant)) throw new UsageError(`--tenant must match ${TENANT_ID_PATTERN}`);
  if (!Number.isFinite(days) || days < 1 || days > 30) throw new UsageError("--expires-days must be 1..30");
  if (!opts.tenantMap) throw new UsageError("--tenant-map (or KALOS_TENANT_MAP_FILE) is required");
  if (!opts.db || !fs.existsSync(opts.db)) throw new UsageError(`auth database not found at ${opts.db}; run the migration first (AUTH_MIGRATE=only)`);
  const publicUrl = String(opts.publicUrl ?? "").replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+$/.test(publicUrl)) throw new UsageError("--public-url (or KALOS_PUBLIC_URL / BETTER_AUTH_URL) must be an origin like https://kalos.example.com");

  const map = readTenantMap(opts.tenantMap);
  const clash = Object.entries(map).find(([, t]) => t === tenant);
  if (clash) throw new UsageError(`tenant ${tenant} is already mapped to organization ${clash[0]}; choose another tenant id`);

  const db = new Database(opts.db, { fileMustExist: true });
  try {
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
    for (const t of ["user", "organization", "invitation", "member"]) {
      if (!tables.has(t)) throw new UsageError(`table "${t}" is missing; run the migration first (AUTH_MIGRATE=only)`);
    }
    if (db.prepare("SELECT 1 FROM organization WHERE slug = ?").get(slug)) throw new UsageError(`an organization with slug ${slug} already exists`);

    const orgId = newId();
    const invitationId = newId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 86400e3);
    if (opts.dryRun) {
      log(JSON.stringify({ dryRun: true, organization: { name, slug }, ownerEmail: email, tenant, expiresAt: expiresAt.toISOString() }));
      return { orgId: null, invitationId: null, link: null };
    }

    // Stage the new map next to the old one so the final step is an atomic rename.
    const next = { ...map, [orgId]: tenant };
    const dir = path.dirname(path.resolve(opts.tenantMap));
    const tmp = path.join(dir, `.${path.basename(opts.tenantMap)}.${process.pid}.tmp`);
    let mode = 0o644;
    try {
      mode = fs.statSync(opts.tenantMap).mode & 0o777;
    } catch {
      /* new file */
    }
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { mode });

    try {
      db.transaction(() => {
        const iso = now.toISOString();
        db.prepare(
          "INSERT OR IGNORE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt, twoFactorEnabled) VALUES (?, ?, ?, 0, NULL, ?, ?, 0)",
        ).run(SYSTEM_USER_ID, "Kalos operator", SYSTEM_USER_EMAIL, iso, iso);
        db.prepare("INSERT INTO organization (id, name, slug, logo, createdAt, metadata) VALUES (?, ?, ?, NULL, ?, NULL)").run(orgId, name, slug, iso);
        db.prepare(
          "INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, createdAt, inviterId) VALUES (?, ?, ?, 'owner', 'pending', ?, ?, ?)",
        ).run(invitationId, orgId, email, expiresAt.toISOString(), iso, SYSTEM_USER_ID);
      })();
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw e;
    }
    try {
      fs.renameSync(tmp, opts.tenantMap);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      log(`WARNING: organization created but the tenant map could not be written (${e.code ?? e.message}).`);
      log(`Add this entry to ${opts.tenantMap} by hand: ${JSON.stringify({ [orgId]: tenant })}`);
    }

    const link = `${publicUrl}/accept-invite/${invitationId}`;
    log(`organization: ${name} (${slug}) id=${orgId}`);
    log(`tenant:       ${tenant} (added to ${opts.tenantMap})`);
    log(`owner invite: ${email}, expires ${expiresAt.toISOString()}`);
    log(`invite link (send it yourself; anyone signing in as ${email} can use it once):`);
    log(`  ${link}`);
    return { orgId, invitationId, link };
  } finally {
    db.close();
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      slug: { type: "string" },
      "owner-email": { type: "string" },
      tenant: { type: "string" },
      db: { type: "string" },
      "tenant-map": { type: "string" },
      "public-url": { type: "string" },
      "expires-days": { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log("usage: node scripts/create-org.mjs --name <name> --slug <slug> --owner-email <email> --tenant <tenant-id> [--db <path>] [--tenant-map <path>] [--public-url <origin>] [--expires-days 7] [--dry-run]");
    return;
  }
  const env = process.env;
  try {
    createOrg({
      name: values.name,
      slug: values.slug,
      ownerEmail: values["owner-email"],
      tenant: values.tenant,
      db: values.db ?? env.AUTH_DB_PATH ?? path.join(process.cwd(), "data", "auth.db"),
      tenantMap: values["tenant-map"] ?? env.KALOS_TENANT_MAP_FILE,
      publicUrl: values["public-url"] ?? env.KALOS_PUBLIC_URL ?? env.BETTER_AUTH_URL,
      expiresDays: values["expires-days"] ?? 7,
      dryRun: values["dry-run"] ?? false,
    });
  } catch (e) {
    console.error(`create-org: ${e instanceof UsageError ? e.message : e?.message ?? e}`);
    process.exit(e instanceof UsageError ? 2 : 1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
