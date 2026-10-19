import { describe, expect, it } from "vitest";
import { mfaErrorText } from "@/lib/mfa-error-copy";

const WRONG = "That code is not right. Check your authenticator app and try again.";

describe("mfaErrorText switches on the Better Auth error code", () => {
  it("503 timeout and session lookup failures say the server could not check the code, not that the code was wrong", () => {
    for (const code of ["MFA_ACCOUNTING_TIMEOUT", "SESSION_LOOKUP_FAILED"]) {
      const t = mfaErrorText(503, { code });
      expect(t).toMatch(/could not check your code/);
      expect(t).not.toBe(WRONG);
    }
  });

  it("a wrong code says it is wrong", () => {
    expect(mfaErrorText(401, { code: "INVALID_CODE" })).toBe(WRONG);
    expect(mfaErrorText(401, { code: "INVALID_BACKUP_CODE" })).toBe(WRONG);
  });

  it("SESSION_REVOKED (too many wrong codes on this session) says so and asks to sign in again", () => {
    const t = mfaErrorText(401, { code: "SESSION_REVOKED" });
    expect(t).toMatch(/Too many wrong codes/);
    expect(t).toMatch(/Sign in again/);
    expect(t).not.toBe(WRONG);
  });

  it("the account-wide lock says too many wrong codes, try later", () => {
    expect(mfaErrorText(429, { code: "TWO_FACTOR_LOCKED" })).toBe("Too many wrong codes. Try again later.");
  });

  it("a replayed code is named as used", () => {
    expect(mfaErrorText(401, { code: "TOTP_REPLAYED" })).toMatch(/already used/);
  });

  it("an unknown 401 is an expired sign-in, not a wrong code", () => {
    expect(mfaErrorText(401, { code: "SESSION_NOT_FOUND" })).toBe("Your sign-in expired. Sign in again.");
    expect(mfaErrorText(401, null)).toBe("Your sign-in expired. Sign in again.");
  });

  it("without a code, status is the fallback", () => {
    expect(mfaErrorText(503, null)).toMatch(/could not check your code/);
    expect(mfaErrorText(429, null)).toBe("Too many wrong codes. Try again later.");
  });

  it("the raw code never reaches the copy", () => {
    for (const code of ["MFA_ACCOUNTING_TIMEOUT", "SESSION_REVOKED", "TWO_FACTOR_LOCKED", "TOTP_REPLAYED", "INVALID_CODE"]) {
      expect(mfaErrorText(400, { code })).not.toContain(code);
    }
  });
});
