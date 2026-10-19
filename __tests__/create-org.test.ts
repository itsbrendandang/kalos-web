import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invitationUsableBy } from "@/lib/server/invitations";
import { ORG_ID_PATTERN, TENANT_ID_PATTERN } from "@/lib/server/tenants";
import { newId } from "../scripts/create-org.mjs";

describe("scripts/create-org.mjs", () => {
  const src = readFileSync(new URL("../scripts/create-org.mjs", import.meta.url), "utf8");
  it("uses the same tenant/org id formats as lib/server/tenants.ts", () => {
    expect(src).toContain(`const TENANT_ID_PATTERN = ${TENANT_ID_PATTERN.toString()};`);
    expect(src).toContain(`const ORG_ID_PATTERN = ${ORG_ID_PATTERN.toString()};`);
  });
  it("generates 32-char ids that are valid org ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9]{32}$/);
      expect(ORG_ID_PATTERN.test(id)).toBe(true);
    }
  });
  it("never sends email and never touches existing map entries", () => {
    expect(src).not.toMatch(/nodemailer|sendmail|smtp/i);
    expect(src).toMatch(/already mapped/);
  });
});

describe("invitationUsableBy", () => {
  const now = Date.UTC(2026, 9, 17);
  const inv = { id: "i", email: "a@example.com", role: "member", status: "pending", expiresAt: new Date(now + 1000).toISOString(), organizationName: "O" };
  it("pending, unexpired, same email (case-insensitive)", () => expect(invitationUsableBy(inv, "A@Example.com", now)).toBe(true));
  it.each([
    ["other email", inv, "b@example.com"],
    ["no email", inv, null],
    ["expired", { ...inv, expiresAt: new Date(now - 1).toISOString() }, "a@example.com"],
    ["accepted", { ...inv, status: "accepted" }, "a@example.com"],
    ["bad date", { ...inv, expiresAt: "garbage" }, "a@example.com"],
    ["missing", null, "a@example.com"],
  ])("rejects %s", (_n, i, e) => expect(invitationUsableBy(i as never, e as string | null, now)).toBe(false));
});
