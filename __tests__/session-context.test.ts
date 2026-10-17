import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { decodeJwt } from "jose";
import { isRecentlyAuthenticated, RECENT_AUTH_MAX_AGE_SECONDS, type SessionContext } from "@/lib/server/session-context";
import { mintEngineTokenForSession } from "@/lib/server/engine-token";
import { scopesForClaims } from "@/lib/server/scopes";

const session: SessionContext = {
  userId: "u_8f2kq1",
  sessionId: "s_77ab",
  orgId: "Xb3k9QmZ2pLr7Tn1",
  role: "member",
  authenticatedAt: 1_000,
  mfaVerified: true,
};

describe("SessionContext helpers (lib/server/session-context.ts)", () => {
  it("step-up window is 5 minutes and fails closed", () => {
    expect(RECENT_AUTH_MAX_AGE_SECONDS).toBe(300);
    expect(isRecentlyAuthenticated({ authenticatedAt: 1_000 }, 300, 1_300)).toBe(true);
    expect(isRecentlyAuthenticated({ authenticatedAt: 1_000 }, 300, 1_301)).toBe(false);
    expect(isRecentlyAuthenticated({ authenticatedAt: null }, 300, 1_000)).toBe(false);
    expect(isRecentlyAuthenticated({ authenticatedAt: Number.NaN }, 300, 1_000)).toBe(false);
    // far-future auth time is not "recent"
    expect(isRecentlyAuthenticated({ authenticatedAt: 5_000 }, 300, 1_000)).toBe(false);
    // a caller cannot widen the window past 300 s
    expect(isRecentlyAuthenticated({ authenticatedAt: 1_000 }, 3_600, 1_400)).toBe(false);
  });

  it("mints from a provider-neutral session with the given tenant and scopes", async () => {
    const key = generateKeyPairSync("ed25519").privateKey;
    const token = await mintEngineTokenForSession(session, "acme-bio", scopesForClaims(session), { kid: "k1", key });
    const c = decodeJwt(token);
    expect(c.sub).toBe("u_8f2kq1");
    expect(c.sid).toBe("s_77ab");
    expect(c.tenant).toBe("acme-bio");
    expect(c.scopes).toEqual(["campaigns:read", "campaigns:write"]);
    // the provider org id is never put in the token
    expect(JSON.stringify(c)).not.toContain(session.orgId);
  });
});
