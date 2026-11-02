import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/audit/route";
import { verifyChain, type AuditEntry } from "@/lib/audit";
import { createHash } from "node:crypto";

const T = "0123456789abcdef0123";
const sha = async (t: string) => createHash("sha256").update(t).digest("hex");
const H = { host: "127.0.0.1:3112", origin: "http://127.0.0.1:3112", "x-kalos-csrf": "1", "content-type": "application/json" };
const post = (body: unknown, headers: Record<string, string> = H) => POST(new NextRequest("http://127.0.0.1:3112/api/audit", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
const saved = { ...process.env };
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kalos-audit-"));
  Object.assign(process.env, { KALOS_LOCAL_MODE: "1", HOSTNAME: "127.0.0.1", KALOS_LOCAL_TOKEN: T, KALOS_STATE_DIR: dir });
  delete process.env.PORT;
});
afterEach(() => { process.env = { ...saved }; });

describe("/api/audit", () => {
  it("is not there outside local mode", async () => {
    delete process.env.KALOS_LOCAL_TOKEN;
    expect((await GET()).status).toBe(404);
    expect((await post({ events: [] })).status).toBe(404);
  });
  it("appends a verifiable chain and lists it", async () => {
    expect((await post({ events: [{ action: "map.created", detail: "one" }, { action: "step.added", detail: "two" }] })).status).toBe(200);
    expect((await post({ events: [{ action: "campaign.upload", detail: "three" }] })).status).toBe(200);
    const { entries } = (await (await GET()).json()) as { entries: AuditEntry[] };
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(await verifyChain(entries, sha)).toEqual({ ok: true });
  });
  it("refuses unknown actions, a foreign origin, a null origin, no CSRF header and a foreign host", async () => {
    expect((await post({ events: [{ action: "made.up", detail: "x" }] })).status).toBe(400);
    expect((await post({ events: [{ action: "map.created", detail: "x" }] }, { ...H, origin: "http://evil.example" })).status).toBe(403);
    expect((await post({ events: [{ action: "map.created", detail: "x" }] }, { ...H, origin: "null" })).status).toBe(403);
    expect((await post({ events: [{ action: "map.created", detail: "x" }] }, { host: H.host, "content-type": "application/json" })).status).toBe(403);
    expect((await post({ events: [{ action: "map.created", detail: "x" }] }, { ...H, host: "evil.example" })).status).toBe(403);
  });
  it("copes with junk bodies and refuses oversized ones", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post("null")).status).toBe(400);
    expect((await post({ events: [null, 3, { action: "map.created", detail: "ok" }] })).status).toBe(200);
    expect((await post({ events: [{ action: "map.created", detail: "x".repeat(70_000) }] })).status).toBe(413);
  });
  it("starts a new line after a torn last line instead of gluing to it", async () => {
    await post({ events: [{ action: "map.created", detail: "one" }] });
    const f = join(dir, "audit-log.jsonl");
    writeFileSync(f, readFileSync(f, "utf8") + '{"seq":2,"at":"x'); // crash mid-write
    expect((await post({ events: [{ action: "step.added", detail: "after" }] })).status).toBe(200);
    expect(readFileSync(f, "utf8").split("\n").some((l) => l.includes('"after"'))).toBe(true);
  });
  it("reports an unreadable file as an error, not an empty history", async () => {
    await post({ events: [{ action: "map.created", detail: "one" }] });
    const f = join(dir, "audit-log.jsonl");
    chmodSync(f, 0o000);
    try {
      if (process.getuid?.() !== 0) {
        expect((await GET()).status).toBe(500);
        expect((await post({ events: [{ action: "step.added", detail: "x" }] })).status).toBe(500);
      }
    } finally { chmodSync(f, 0o600); }
  });
});
