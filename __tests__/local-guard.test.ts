import { describe, expect, it } from "vitest";
import { hostAllowed, localGate, originAllowed, readTextCapped, tokenEquals } from "@/lib/server/local-guard";

describe("hostAllowed", () => {
  it("accepts loopback names", () => {
    for (const h of ["127.0.0.1:3112", "localhost:3112", "[::1]:3112", "LOCALHOST:3112", "127.0.0.1"]) expect(hostAllowed(h, {})).toBe(true);
  });
  it("refuses rebinding, tunnels and junk", () => {
    for (const h of ["evil.example:3112", "127.0.0.1.evil.example", "localhost.evil.example:3112", "a.trycloudflare.com", "", null, "127.0.0.1:3112@evil.example", "0.0.0.0:3112", "x".repeat(200)]) expect(hostAllowed(h as string | null, {})).toBe(false);
  });
  it("pins the port when PORT is known", () => {
    expect(hostAllowed("127.0.0.1:3112", { PORT: "3112" })).toBe(true);
    expect(hostAllowed("127.0.0.1:9999", { PORT: "3112" })).toBe(false);
    expect(hostAllowed("127.0.0.1", { PORT: "3112" })).toBe(false);
  });
});
describe("originAllowed", () => {
  it("matches the host, and refuses null and junk origins without throwing", () => {
    expect(originAllowed(null, "127.0.0.1:1")).toBe(true);
    expect(originAllowed("http://127.0.0.1:1", "127.0.0.1:1")).toBe(true);
    expect(originAllowed("http://evil.example", "127.0.0.1:1")).toBe(false);
    expect(originAllowed("null", "127.0.0.1:1")).toBe(false);
    expect(originAllowed("::::", "127.0.0.1:1")).toBe(false);
  });
});
describe("tokenEquals", () => {
  it("compares exactly", () => {
    expect(tokenEquals("abcd", "abcd")).toBe(true);
    expect(tokenEquals("abce", "abcd")).toBe(false);
    expect(tokenEquals("abc", "abcd")).toBe(false);
    expect(tokenEquals(null, "abcd")).toBe(false);
  });
});
describe("localGate", () => {
  const base = { token: "0123456789abcdef0123", env: {} as Record<string, string> };
  it("lets a request with the cookie through", () => expect(localGate({ ...base, host: "127.0.0.1:1", cookie: base.token, query: null }).action).toBe("next"));
  it("turns the first visit's secret into a cookie", () => expect(localGate({ ...base, host: "127.0.0.1:1", cookie: null, query: base.token }).action).toBe("set-cookie-redirect"));
  it("refuses no secret or a wrong one", () => {
    expect(localGate({ ...base, host: "127.0.0.1:1", cookie: null, query: null })).toEqual({ action: "deny", status: 403 });
    expect(localGate({ ...base, host: "127.0.0.1:1", cookie: "nope", query: "nope" })).toEqual({ action: "deny", status: 403 });
  });
  it("refuses a foreign host even with the secret", () => expect(localGate({ ...base, host: "evil.example", cookie: base.token, query: base.token })).toEqual({ action: "deny", status: 421 }));
});
describe("readTextCapped", () => {
  const req = (body: string, h: Record<string, string> = {}) => new Request("http://x/", { method: "POST", body, headers: h });
  it("reads small bodies", async () => expect(await readTextCapped(req("hello"), 10)).toBe("hello"));
  it("refuses over the cap, declared or streamed", async () => {
    expect(await readTextCapped(req("0123456789ab"), 10)).toBeNull();
    expect(await readTextCapped(req("x", { "content-length": "999" }), 10)).toBeNull();
  });
});
