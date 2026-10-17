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
