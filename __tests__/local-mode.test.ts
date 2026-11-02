import { describe, expect, it } from "vitest";
import { isLocalMode, localToken } from "@/lib/local-mode";

const T = "0123456789abcdef0123";
describe("isLocalMode", () => {
  it("needs the flag, a loopback bind and the launch secret", () => {
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", HOSTNAME: "127.0.0.1", KALOS_LOCAL_TOKEN: T })).toBe(true);
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", HOSTNAME: "localhost", KALOS_LOCAL_TOKEN: T })).toBe(true);
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", HOSTNAME: " ::1 ", KALOS_LOCAL_TOKEN: T })).toBe(true);
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", HOSTNAME: "[::1]", KALOS_LOCAL_TOKEN: T })).toBe(true);
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", HOSTNAME: "LOCALHOST", KALOS_LOCAL_TOKEN: T })).toBe(true);
  });
  it("stays off for a networked bind, an unset host, no flag, or a missing or short secret", () => {
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", HOSTNAME: "0.0.0.0", KALOS_LOCAL_TOKEN: T })).toBe(false);
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", KALOS_LOCAL_TOKEN: T })).toBe(false);
    expect(isLocalMode({ HOSTNAME: "127.0.0.1", KALOS_LOCAL_TOKEN: T })).toBe(false);
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", HOSTNAME: "127.0.0.1" })).toBe(false);
    expect(isLocalMode({ KALOS_LOCAL_MODE: "1", HOSTNAME: "127.0.0.1", KALOS_LOCAL_TOKEN: "short" })).toBe(false);
  });
  it("trims the secret", () => expect(localToken({ KALOS_LOCAL_TOKEN: `  ${T}  ` })).toBe(T));
});
