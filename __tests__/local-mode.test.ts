import { describe, expect, it } from "vitest";
import { isLocalMode } from "@/lib/local-mode";

describe("isLocalMode", () => {
  it("needs the flag and a loopback bind", () => {
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", HOSTNAME: "127.0.0.1" })).toBe(true);
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", HOSTNAME: "localhost" })).toBe(true);
  });
  it("stays off for a networked bind, an unset host or no flag", () => {
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", HOSTNAME: "0.0.0.0" })).toBe(false);
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1" })).toBe(false);
    expect(isLocalMode({ HOSTNAME: "127.0.0.1" })).toBe(false);
  });
});
