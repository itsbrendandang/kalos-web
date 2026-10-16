import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/engine/[...path]/route";

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(url, init);
}

function ctx(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

/** A real Response, mirroring what the engine would send back untouched. */
function engineResponse(
  status: number,
  body: unknown,
  contentType = "application/json",
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": contentType, ...extraHeaders },
  });
}

describe("engine proxy (app/api/engine/[...path]/route.ts)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("KALOS_ENGINE_URL", "http://engine.internal:8050");
    vi.stubEnv("KALOS_ENGINE_TOKEN", "test-token-123");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards GET with the bearer auth header, joined URL, and query string", async () => {
    fetchMock.mockResolvedValueOnce(engineResponse(200, { ok: true }));

    const res = await GET(req("http://localhost:3000/api/engine/api/campaign?foo=bar"), ctx(["api", "campaign"]));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://engine.internal:8050/api/campaign?foo=bar");
    expect(init.method).toBe("GET");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer test-token-123");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("forwards Retry-After on a 503 (kalos/portal/busy.py's single analysis slot)", async () => {
    // Regression test: found live in the 2026-09-16 production test cycle's
    // concurrency check - a real 503 from the engine's busy slot carries
    // Retry-After, but the proxy's header allowlist only copied
    // content-type, so every caller through this route (including
    // kalos-web's own client code) silently lost it.
    fetchMock.mockResolvedValueOnce(
      engineResponse(503, { error: "An analysis is already running." }, "application/json", {
        "retry-after": "60",
      }),
    );

    const res = await POST(req("http://localhost:3000/api/engine/api/run", { method: "POST" }), ctx(["api", "run"]));

    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("forwards POST with a JSON body and the bearer auth header, status and body untouched", async () => {
    fetchMock.mockResolvedValueOnce(engineResponse(201, { started: true }));

    const res = await POST(
      req("http://localhost:3000/api/engine/api/campaign/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipes: [] }),
      }),
      ctx(["api", "campaign", "start"]),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://engine.internal:8050/api/campaign/start");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer test-token-123");
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
    // Undici requires this whenever a streamed body is sent.
    expect((init as unknown as { duplex: string }).duplex).toBe("half");
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ started: true });
  });

  it("streams a multipart upload through with the boundary intact (POST /api/run)", async () => {
    fetchMock.mockResolvedValueOnce(engineResponse(200, { has_data: true }));
    const fd = new FormData();
    fd.append("file", new File(["a,b\n1,2"], "sheet.csv", { type: "text/csv" }));
    fd.append("name", "Feed test");
    const request = req("http://localhost:3000/api/engine/api/run", { method: "POST", body: fd });
    const sentContentType = request.headers.get("content-type");
    expect(sentContentType).toMatch(/^multipart\/form-data; boundary=/);

    const res = await POST(request, ctx(["api", "run"]));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://engine.internal:8050/api/run");
    // The exact same boundary, and the body streamed to the engine (through the
    // byte-counting pipe), not buffered into a string and re-parsed.
    expect((init.headers as Headers).get("content-type")).toBe(sentContentType);
    expect(init.body).toBeInstanceOf(ReadableStream);
    const forwarded = await new Response(init.body as ReadableStream).text();
    expect(forwarded).toContain("Feed test");
    expect(forwarded).toContain("a,b\n1,2");
    expect((init as unknown as { duplex: string }).duplex).toBe("half");
    expect(res.status).toBe(200);
  });

  it("rejects a path outside the allowlist with 404, without calling the engine", async () => {
    const res = await GET(req("http://localhost:3000/api/engine/api/admin/secrets"), ctx(["api", "admin", "secrets"]));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/no such engine route/);
  });

  it("no longer proxies the removed experiment-store routes (api/experiments)", async () => {
    const res = await GET(req("http://localhost:3000/api/engine/api/experiments"), ctx(["api", "experiments"]));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });

  it("rejects a bare prefix-collision path (api/campaignish) that is not actually allowlisted", async () => {
    const res = await GET(req("http://localhost:3000/api/engine/api/campaignish"), ctx(["api", "campaignish"]));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });

  it("forwards POST /api/scale/readout (the Scale-Up Readout upload)", async () => {
    fetchMock.mockResolvedValueOnce(engineResponse(200, "<html></html>", "text/html"));
    const fd = new FormData();
    fd.append("file", new File(["scale_L,titer\n1,2"], "sheet.csv", { type: "text/csv" }));
    fd.append("target", JSON.stringify({ scale_L: 7500, target_column: "titer", process_params: {} }));

    const res = await POST(
      req("http://localhost:3000/api/engine/api/scale/readout", { method: "POST", body: fd }),
      ctx(["api", "scale", "readout"]),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://engine.internal:8050/api/scale/readout");
    expect(res.status).toBe(200);
  });

  it("rejects a near-miss prefix (api/scaley) that is not actually allowlisted", async () => {
    const res = await GET(req("http://localhost:3000/api/engine/api/scaley"), ctx(["api", "scaley"]));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });

  it("returns a 502 JSON error when the engine is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const res = await GET(req("http://localhost:3000/api/engine/api/latest"), ctx(["api", "latest"]));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("engine unreachable");
  });

  it("returns a 502 JSON error when the engine request times out", async () => {
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.useFakeTimers();

    const pending = GET(req("http://localhost:3000/api/engine/api/latest"), ctx(["api", "latest"]));
    await vi.runAllTimersAsync();
    const res = await pending;

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("engine request timed out");
    vi.useRealTimers();
  });

  it("omits the Authorization header when KALOS_ENGINE_TOKEN is unset (engine open mode)", async () => {
    vi.stubEnv("KALOS_ENGINE_TOKEN", "");
    fetchMock.mockResolvedValueOnce(engineResponse(200, { ok: true }));

    await GET(req("http://localhost:3000/api/engine/api/latest"), ctx(["api", "latest"]));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).has("authorization")).toBe(false);
  });

  it("returns a 500 with setup guidance when the engine 401s and KALOS_ENGINE_TOKEN is unset", async () => {
    vi.stubEnv("KALOS_ENGINE_TOKEN", "");
    fetchMock.mockResolvedValueOnce(engineResponse(401, { detail: "authentication required" }));

    const res = await GET(req("http://localhost:3000/api/engine/api/latest"), ctx(["api", "latest"]));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error:
        "Kalos engine requires authentication. Set KALOS_ENGINE_TOKEN in your .env.local to match the engine's configured tokens.",
    });
  });

  it("treats a whitespace-only KALOS_ENGINE_TOKEN as unset", async () => {
    vi.stubEnv("KALOS_ENGINE_TOKEN", "   ");
    fetchMock.mockResolvedValueOnce(engineResponse(401, { detail: "authentication required" }));

    const res = await GET(req("http://localhost:3000/api/engine/api/latest"), ctx(["api", "latest"]));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).has("authorization")).toBe(false);
    expect(res.status).toBe(500);
  });

  it("passes a 401 through untouched when a token IS configured (wrong token)", async () => {
    fetchMock.mockResolvedValueOnce(engineResponse(401, { detail: "invalid token" }));

    const res = await GET(req("http://localhost:3000/api/engine/api/latest"), ctx(["api", "latest"]));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ detail: "invalid token" });
  });

  it("rejects a declared Content-Length over the cap with 413 and never calls fetch", async () => {
    vi.stubEnv("KALOS_MAX_UPLOAD_MB", "1");
    const res = await POST(
      req("http://localhost:3000/api/engine/api/run", {
        method: "POST",
        headers: { "content-length": String(2 * 1024 * 1024) },
        body: "x",
      }),
      ctx(["api", "run"]),
    );
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cuts off a chunked body (no Content-Length) that streams past the cap", async () => {
    vi.stubEnv("KALOS_MAX_UPLOAD_MB", "1");
    // Drain the forwarded body the way undici would; the counting stream errors past the cap.
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      const reader = (init.body as ReadableStream<Uint8Array>).getReader();
      for (;;) if ((await reader.read()).done) break;
      return engineResponse(200, { ok: true });
    });
    const chunk = new Uint8Array(512 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 4; i++) c.enqueue(chunk); // 2 MiB total
        c.close();
      },
    });
    const res = await POST(
      new NextRequest("http://localhost:3000/api/engine/api/run", {
        method: "POST",
        body: stream,
        duplex: "half",
      } as ConstructorParameters<typeof NextRequest>[1]),
      ctx(["api", "run"]),
    );
    expect(res.status).toBe(413);
  });

  it("forwards a body under the cap", async () => {
    vi.stubEnv("KALOS_MAX_UPLOAD_MB", "1");
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      const reader = (init.body as ReadableStream<Uint8Array>).getReader();
      let n = 0;
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        n += r.value.byteLength;
      }
      return engineResponse(200, { received: n });
    });
    const res = await POST(
      req("http://localhost:3000/api/engine/api/run", { method: "POST", body: "a".repeat(1000) }),
      ctx(["api", "run"]),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: 1000 });
  });

  it("returns a 502 (and never calls fetch) when KALOS_ENGINE_URL is not configured", async () => {
    vi.stubEnv("KALOS_ENGINE_URL", "");

    const res = await GET(req("http://localhost:3000/api/engine/api/latest"), ctx(["api", "latest"]));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(502);
  });
});
