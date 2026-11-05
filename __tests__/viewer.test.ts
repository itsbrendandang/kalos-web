import { describe, expect, it } from "vitest";
import { approverSentence, LOCAL_LABEL, viewerFrom, viewerLabel } from "@/lib/viewer";
import { profileName } from "@/lib/server/session";

describe("viewerFrom", () => {
  it("takes the name and email from a session state, never a guess", () => {
    expect(viewerFrom({ status: "ok", name: "Ada Lovelace", email: "ada@example.com" })).toEqual({ kind: "signed-in", name: "Ada Lovelace", email: "ada@example.com" });
    expect(viewerFrom({ status: "no_org", name: null, email: "a@example.com" })).toEqual({ kind: "signed-in", name: null, email: "a@example.com" });
  });
  it("an anonymous state is unknown, not a signed-in user", () => {
    expect(viewerFrom({ status: "anonymous" })).toEqual({ kind: "unknown" });
  });
});

describe("viewerLabel: the name recorded against a change", () => {
  it("prefers the profile name, then the email", () => {
    expect(viewerLabel({ kind: "signed-in", name: "Ada Lovelace", email: "ada@example.com" })).toBe("Ada Lovelace");
    expect(viewerLabel({ kind: "signed-in", name: null, email: "ada@example.com" })).toBe("ada@example.com");
    expect(viewerLabel({ kind: "signed-in", name: null, email: null })).toBe("Signed-in user");
  });
  it("local mode says so plainly, and never shows 'this device'", () => {
    expect(viewerLabel({ kind: "local" })).toBe(LOCAL_LABEL);
    expect(LOCAL_LABEL).toBe("Local mode, no sign-in");
    expect(viewerLabel({ kind: "unknown" })).not.toMatch(/this device/);
  });
});

describe("approverSentence", () => {
  it("names the real user when there is one", () => {
    expect(approverSentence({ kind: "signed-in", name: "Ada Lovelace", email: "ada@example.com" })).toBe("You are approving as Ada Lovelace.");
    expect(approverSentence({ kind: "signed-in", name: null, email: "ada@example.com" })).toBe("You are approving as ada@example.com.");
  });
  it("says there is no user in local mode, and never claims a signature", () => {
    const s = approverSentence({ kind: "local" });
    expect(s).toMatch(/Local mode, no sign-in/);
    for (const v of [{ kind: "local" as const }, { kind: "unknown" as const }, { kind: "signed-in" as const, name: null, email: null }]) {
      expect(approverSentence(v)).not.toMatch(/sign(ed|ature)\b|e-sign/i);
    }
  });
});

describe("profileName", () => {
  it("trims, and treats blank or non-string values as no name", () => {
    expect(profileName("  Ada Lovelace ")).toBe("Ada Lovelace");
    expect(profileName("   ")).toBeNull();
    expect(profileName(undefined)).toBeNull();
    expect(profileName(42)).toBeNull();
  });
});
