import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { forwardToLocalEngine, localEngineToken } from "@/lib/server/local-engine";

const H = { host: "127.0.0.1:3112", origin: "http://127.0.0.1:3112", "x-kalos-csrf": "1" };
const saved = { ...process.env };
const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  process.env.KALOS_ENGINE_URL = "http://127.0.0.1:8050";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});
afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); });

const get = (path: string, h: Record<string, string> = H) => forwardToLocalEngine(new Request(`http://127.0.0.1:3112/api/engine/${path}`, { headers: h }), path.split("?")[0].split("/"));

describe("forwardToLocalEngine", () => {
  it("forwards a known GET without credentials", async () => {
    const r = await get("api/campaign");
    expect(r.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8050/api/campaign");
    expect(new Headers(init.headers).has("authorization")).toBe(false);
  });
  it("sends the shell's engine secret as a bearer token, never the browser's Authorization", async () => {
    process.env.KALOS_ENGINE_TOKEN = "engine-secret-0123456789abcdef";
    const r = await get("api/campaign", { ...H, authorization: "Bearer forged-by-the-page" });
    expect(r.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer engine-secret-0123456789abcdef");
  });
  it("drops the browser's Authorization when no engine secret is set", async () => {
    await get("api/campaign", { ...H, authorization: "Bearer forged-by-the-page" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).has("authorization")).toBe(false);
  });
  it("ignores an engine secret that is too short or could split a header", () => {
    expect(localEngineToken({ KALOS_ENGINE_TOKEN: "short" })).toBeNull();
    expect(localEngineToken({ KALOS_ENGINE_TOKEN: "a".repeat(20) + "\r\nx: y" })).toBeNull();
    expect(localEngineToken({})).toBeNull();
    expect(localEngineToken({ KALOS_ENGINE_TOKEN: " " + "b".repeat(32) + " " })).toBe("b".repeat(32));
  });
  it("404s unknown routes", async () => expect((await get("healthz")).status).toBe(404));
  it("refuses a foreign host even with matching origin", async () => {
    const r = await get("api/campaign", { host: "evil.example", origin: "http://evil.example", "x-kalos-csrf": "1" });
    expect(r.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("needs the CSRF marker to write", async () => {
    const r = await forwardToLocalEngine(new Request("http://127.0.0.1:3112/api/engine/api/campaign/reanalyze", { method: "POST", headers: { host: H.host, origin: H.origin } }), ["api", "campaign", "reanalyze"]);
    expect(r.status).toBe(403);
  });
  it("refuses a JSON route sent as the wrong media type", async () => {
    const r = await forwardToLocalEngine(new Request("http://127.0.0.1:3112/api/engine/api/campaign/result", { method: "POST", headers: { ...H, "content-type": "text/plain" }, body: "x" }), ["api", "campaign", "result"]);
    expect(r.status).toBe(415);
  });
  it("refuses an over-long query and an oversized declared body", async () => {
    expect((await get(`api/campaign?q=${"a".repeat(3000)}`)).status).toBe(400);
    const r = await forwardToLocalEngine(new Request("http://127.0.0.1:3112/api/engine/api/campaign/result", { method: "POST", headers: { ...H, "content-type": "application/json", "content-length": String(5 * 1024 * 1024) }, body: "{}" }), ["api", "campaign", "result"]);
    expect(r.status).toBe(413);
  });
});
