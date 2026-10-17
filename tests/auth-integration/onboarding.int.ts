// (B) Google-only, invite-only onboarding: scopes, email_verified, invitation
// gate, create-org CLI, accept-invite, wrong recipient, no email/password.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, enrolTotp, freshAuth, googleSignIn, interceptGoogle, makeSigner, totpAt } from "./helpers.mjs";
import { createOrg } from "../../scripts/create-org.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
let claims: Record<string, unknown> = {};
let google: { calls: unknown[]; restore: () => void };
let env: any;
let ownerTotp = "";
const users = () => env.db.prepare("SELECT email, emailVerified FROM user WHERE id <> 'kalos-system' ORDER BY email").all();

beforeAll(async () => {
  const signer = await makeSigner();
  google = interceptGoogle(signer, () => claims);
  env = await freshAuth();
});
afterAll(() => {
  google.restore();
  env.cleanup();
});

function seedOrg(slug: string, ownerEmail: string, tenant: string) {
  const map = path.join(env.dir, "tenants.json");
  const out = createOrg({ name: `Org ${slug}`, slug, ownerEmail, tenant, db: env.file, tenantMap: map, publicUrl: "http://localhost:3000" }, () => {});
  return { ...out, map };
}

describe("Google sign-in request guard", () => {
  it("asks Google for exactly 'openid email profile', no include_granted_scopes, no offline access", async () => {
    const r = await googleSignIn(client(env.auth));
    expect(r.authUrl.searchParams.get("scope")).toBe("openid email profile");
    expect(r.authUrl.searchParams.get("include_granted_scopes")).toBeNull();
    expect(r.authUrl.searchParams.get("access_type")).toBeNull();
    expect(r.authUrl.searchParams.get("code_challenge_method")).toBe("S256");
  });
  it("rejects client-supplied scopes, id tokens and other providers on /sign-in/social", async () => {
    const c = client(env.auth);
    const s = await c.req("/sign-in/social", { method: "POST", body: { provider: "google", scopes: ["https://www.googleapis.com/auth/drive"] } });
    expect(s.status).toBe(400);
    expect(s.json.code).toBe("SCOPES_NOT_ALLOWED");
    const t = await c.req("/sign-in/social", { method: "POST", body: { provider: "google", idToken: { token: "x" } } });
    expect(t.status).toBe(400);
    const p = await c.req("/sign-in/social", { method: "POST", body: { provider: "github" } });
    expect(p.status).toBe(400);
  });
  it("has no email/password, password reset, linking or 2FA-disable endpoints", async () => {
    const c = client(env.auth);
    for (const p of ["/sign-up/email", "/sign-in/email", "/request-password-reset", "/reset-password", "/link-social", "/two-factor/disable", "/change-email"]) {
      const r = await c.req(p, { method: "POST", body: { email: "a@example.com", password: "long-enough-password", provider: "google" } });
      expect(r.status, p).toBe(404);
    }
  });
});

describe("invite-only onboarding", () => {
  it("rejects a Google account whose email is not verified, without creating a user", async () => {
    claims = { sub: "g-unv", email: "unv@example.com", email_verified: false, name: "U" };
    const r = await googleSignIn(client(env.auth));
    expect(r.location).toMatch(/\/sign-in\?error=email_not_verified/);
    expect(users()).toEqual([]);
  });
  it("rejects an uninvited (verified) Google account, without creating a user", async () => {
    claims = { sub: "g-stranger", email: "stranger@example.com", email_verified: true, name: "S" };
    const r = await googleSignIn(client(env.auth));
    expect(r.location).toMatch(/\/sign-in\?error=not_invited/);
    expect(users()).toEqual([]);
    expect(google.calls.length).toBeGreaterThan(0); // token exchange went to the fake
  });

  it("create-org CLI: org + owner invitation + tenant map entry; the invited owner can sign up, enrol MFA and accept", async () => {
    const { orgId, invitationId, link, map } = seedOrg("acme", "Owner@Example.com", "acme");
    expect(link).toBe(`http://localhost:3000/accept-invite/${invitationId}`);
    expect(JSON.parse(fs.readFileSync(map, "utf8"))).toEqual({ [orgId as string]: "acme" });

    claims = { sub: "g-owner", email: "owner@example.com", email_verified: true, name: "Owner" };
    const c = client(env.auth);
    const r = await googleSignIn(c, { callbackURL: `/accept-invite/${invitationId}` });
    expect(r.location).toBe(`/accept-invite/${invitationId}`);
    const s = await c.req("/get-session");
    expect(s.json.session.mfaVerifiedAt).toBeNull();

    // half session cannot accept yet
    const early = await c.req("/organization/accept-invitation", { method: "POST", body: { invitationId } });
    expect(early.status).toBe(403);
    expect(early.json.code).toBe("MFA_REQUIRED");

    ownerTotp = (await enrolTotp(c)).totpURI;
    const acc = await c.req("/organization/accept-invitation", { method: "POST", body: { invitationId } });
    expect(acc.status).toBe(200);
    expect(acc.json.member.role).toBe("owner");
    expect(acc.json.member.organizationId).toBe(orgId);
  });

  it("refuses to map a tenant id that already belongs to another org, and never rewrites existing entries", () => {
    expect(() => seedOrg("acme2", "x@example.com", "acme")).toThrow(/already mapped/);
    const before = fs.readFileSync(path.join(env.dir, "tenants.json"), "utf8");
    seedOrg("beta", "y@example.com", "beta");
    const after = JSON.parse(fs.readFileSync(path.join(env.dir, "tenants.json"), "utf8"));
    for (const [k, v] of Object.entries(JSON.parse(before))) expect(after[k]).toBe(v);
  });

  it("owner invites a member with no email transport; the invitation link only works for the invited email", async () => {
    claims = { sub: "g-owner", email: "owner@example.com", email_verified: true, name: "Owner" };
    const owner = client(env.auth);
    await googleSignIn(owner);
    const org = env.db.prepare("SELECT id FROM organization WHERE slug='acme'").get();
    // re-sign-in is a half session again: must verify, not re-enrol
    const reenrol = await owner.req("/two-factor/enable", { method: "POST", body: {} });
    expect(reenrol.status).toBe(403);
    const inv0 = await owner.req("/organization/invite-member", { method: "POST", body: { email: "carol@example.com", role: "member", organizationId: org.id } });
    expect(inv0.status).toBe(403); // half session
    const up = await owner.req("/two-factor/verify-totp", { method: "POST", body: { code: await totpAt(ownerTotp, 1) } });
    expect(up.status).toBe(200);

    const inv = await owner.req("/organization/invite-member", { method: "POST", body: { email: "carol@example.com", role: "viewer", organizationId: org.id } });
    expect(inv.status).toBe(200);
    const inv2 = await owner.req("/organization/invite-member", { method: "POST", body: { email: "dave@example.com", role: "member", organizationId: org.id } });
    expect(inv2.status).toBe(200);

    claims = { sub: "g-carol", email: "carol@example.com", email_verified: true, name: "Carol" };
    const carol = client(env.auth);
    await googleSignIn(carol);
    await enrolTotp(carol);
    // Carol cannot take Dave's invitation
    const steal = await carol.req("/organization/accept-invitation", { method: "POST", body: { invitationId: inv2.json.id } });
    expect(steal.status).toBe(403);
    const mine = await carol.req("/organization/accept-invitation", { method: "POST", body: { invitationId: inv.json.id } });
    expect(mine.status).toBe(200);
    expect(mine.json.member.role).toBe("viewer");
    // a viewer cannot invite
    const vInv = await carol.req("/organization/invite-member", { method: "POST", body: { email: "eve@example.com", role: "member", organizationId: org.id } });
    expect(vInv.status).toBe(403);
    // only owners may invite owners (Better Auth rule); the owner can
    const ownerInvite = await owner.req("/organization/invite-member", { method: "POST", body: { email: "frank@example.com", role: "owner", organizationId: org.id } });
    expect(ownerInvite.status).toBe(200);
    // users cannot create or delete organizations
    const create = await owner.req("/organization/create", { method: "POST", body: { name: "Mine", slug: "mine" } });
    expect(create.status).toBe(403);
    const del = await owner.req("/organization/delete", { method: "POST", body: { organizationId: org.id } });
    expect(del.status).toBeGreaterThanOrEqual(400);
  });

  it("an expired invitation no longer admits a new user", async () => {
    const { invitationId } = seedOrg("gamma", "late@example.com", "gamma");
    env.db.prepare("UPDATE invitation SET expiresAt = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), invitationId);
    claims = { sub: "g-late", email: "late@example.com", email_verified: true, name: "Late" };
    const r = await googleSignIn(client(env.auth));
    expect(r.location).toMatch(/error=not_invited/);
  });
});
