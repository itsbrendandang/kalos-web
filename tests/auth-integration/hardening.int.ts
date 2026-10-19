// Hardening of stock Better Auth endpoints (review optional items):
// /organization/list-invitations is org:admin only (members and viewers get
// 403 INVITATIONS_ADMIN_ONLY; owners and admins get the list).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, enrolTotp, freshAuth, googleSignIn, interceptGoogle, makeSigner } from "./helpers.mjs";
import { createOrg } from "../../scripts/create-org.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
let claims: Record<string, unknown> = {};
let google: { restore: () => void };
let env: any;

beforeAll(async () => {
  google = interceptGoogle(await makeSigner(), () => claims);
  env = await freshAuth();
});
afterAll(() => {
  google.restore();
  env.cleanup();
});

async function signInEnrol(email: string) {
  claims = { sub: `g-${email}`, email, email_verified: true, name: email };
  const c = client(env.auth);
  await googleSignIn(c);
  await enrolTotp(c);
  return c;
}

describe("list-invitations is org:admin only", () => {
  it("member and viewer are refused; owner and admin can list", async () => {
    createOrg({ name: "Hard", slug: "hard", ownerEmail: "hard-owner@example.com", tenant: "hard", db: env.file, tenantMap: `${env.dir}/tenants.json`, publicUrl: "http://localhost:3000" }, () => {});
    const orgId = env.db.prepare("SELECT id FROM organization WHERE slug='hard'").get().id;
    const owner = await signInEnrol("hard-owner@example.com");
    const ownInv = env.db.prepare("SELECT id FROM invitation WHERE email='hard-owner@example.com'").get().id;
    expect((await owner.req("/organization/accept-invitation", { method: "POST", body: { invitationId: ownInv } })).status).toBe(200);
    for (const [email, role] of [["hard-admin@example.com", "admin"], ["hard-member@example.com", "member"], ["hard-viewer@example.com", "viewer"]] as const) {
      const inv = await owner.req("/organization/invite-member", { method: "POST", body: { email, role, organizationId: orgId } });
      expect(inv.status, email + " " + inv.text).toBe(200);
    }
    const list = `/organization/list-invitations?organizationId=${orgId}`;
    expect((await owner.req(list)).status).toBe(200);

    for (const email of ["hard-admin@example.com", "hard-member@example.com", "hard-viewer@example.com"]) {
      const c = await signInEnrol(email);
      const invId = env.db.prepare("SELECT id FROM invitation WHERE email=? AND status='pending'").get(email).id;
      expect((await c.req("/organization/accept-invitation", { method: "POST", body: { invitationId: invId } })).status, email).toBe(200);
      const r = await c.req(list);
      if (email === "hard-admin@example.com") {
        expect(r.status, email).toBe(200);
      } else {
        expect(r.status, email).toBe(403);
        expect(r.json.code, email).toBe("INVITATIONS_ADMIN_ONLY");
      }
    }
  });
});

describe("update-user is bounded", () => {
  it("a MFA'd user can set a normal name; over-long names and non-https images are refused", async () => {
    createOrg({ name: "Profile", slug: "profile", ownerEmail: "profile@example.com", tenant: "profile", db: env.file, tenantMap: `${env.dir}/tenants.json`, publicUrl: "http://localhost:3000" }, () => {});
    const c = await signInEnrol("profile@example.com");
    expect((await c.req("/update-user", { method: "POST", body: { name: "A".repeat(101) } })).json?.code).toBe("PROFILE_INVALID");
    expect((await c.req("/update-user", { method: "POST", body: { image: "http://evil.example/x.png" } })).json?.code).toBe("PROFILE_INVALID");
    const ok = await c.req("/update-user", { method: "POST", body: { name: "Profile Person" } });
    expect(ok.status).toBe(200);
    expect((await c.req("/get-session")).json.user.name).toBe("Profile Person");
  });
});

let fullMember: any;
describe("get-full-organization hides pending invitations from non-admins", () => {
  it("owner and admin see invitations; member and viewer get the org without them; outsiders are refused", async () => {
    createOrg({ name: "Full", slug: "full", ownerEmail: "full-owner@example.com", tenant: "full", db: env.file, tenantMap: `${env.dir}/tenants.json`, publicUrl: "http://localhost:3000" }, () => {});
    const orgId = env.db.prepare("SELECT id FROM organization WHERE slug='full'").get().id;
    const owner = await signInEnrol("full-owner@example.com");
    const ownInv = env.db.prepare("SELECT id FROM invitation WHERE email='full-owner@example.com'").get().id;
    expect((await owner.req("/organization/accept-invitation", { method: "POST", body: { invitationId: ownInv } })).status).toBe(200);
    for (const [email, role] of [["full-admin@example.com", "admin"], ["full-member@example.com", "member"], ["full-viewer@example.com", "viewer"], ["full-pending@example.com", "member"]] as const) {
      expect((await owner.req("/organization/invite-member", { method: "POST", body: { email, role, organizationId: orgId } })).status, email).toBe(200);
    }
    const full = `/organization/get-full-organization?organizationId=${orgId}`;
    const ownerView = await owner.req(full);
    expect(ownerView.status).toBe(200);
    expect(ownerView.json.invitations.map((i: any) => i.email)).toEqual(expect.arrayContaining(["full-admin@example.com", "full-member@example.com", "full-pending@example.com"]));

    for (const email of ["full-admin@example.com", "full-member@example.com", "full-viewer@example.com"]) {
      const c = await signInEnrol(email);
      if (email === "full-member@example.com") fullMember = c;
      const invId = env.db.prepare("SELECT id FROM invitation WHERE email=? AND status='pending'").get(email).id;
      expect((await c.req("/organization/accept-invitation", { method: "POST", body: { invitationId: invId } })).status, email).toBe(200);
      const r = await c.req(full);
      if (email === "full-admin@example.com") {
        expect(r.status, email).toBe(200);
        expect(r.json.invitations.map((i: any) => i.email), email).toContain("full-pending@example.com");
      } else {
        expect(r.status, email).toBe(200);
        expect("invitations" in r.json, email).toBe(false);
        expect(r.text, email).not.toContain("full-pending@example.com");
        expect(r.json.id).toBe(orgId);
        expect(r.json.members.length, email).toBeGreaterThan(0); // roster is still visible to members
      }
    }

    // a stranger with a verified invite to ANOTHER org is refused outright
    createOrg({ name: "Other", slug: "other", ownerEmail: "other-owner@example.com", tenant: "other", db: env.file, tenantMap: `${env.dir}/tenants.json`, publicUrl: "http://localhost:3000" }, () => {});
    const stranger = await signInEnrol("other-owner@example.com");
    const r = await stranger.req(full);
    expect(r.status).toBe(403);
    expect(r.text).not.toContain("full-pending@example.com");
  });

  it("the other stock invitation endpoints do not reveal other people's invitations to a member", async () => {
    const member = fullMember;
    const pending = env.db.prepare("SELECT id FROM invitation WHERE email='full-pending@example.com'").get().id;
    // get-invitation: only the invited address may read an invitation
    const gi = await member.req(`/organization/get-invitation?id=${pending}`);
    expect(gi.status).toBe(403);
    expect(gi.text).not.toContain("full-pending@example.com");
    // list-user-invitations: the email query parameter is server-side only
    const lu = await member.req("/organization/list-user-invitations?email=full-pending@example.com");
    expect(lu.status).toBe(400);
    expect(lu.text).not.toContain("full-pending@example.com");
    // list-invitations stays org:admin only
    expect((await member.req(`/organization/list-invitations?organizationId=${env.db.prepare("SELECT id FROM organization WHERE slug='full'").get().id}`)).status).toBe(403);
  });
});
