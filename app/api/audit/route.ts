// Local-only change history, appended to a file in the Kalos state folder
// (~/.kalos/audit-log.jsonl by default). One JSON entry per line, each chained
// to the hash of the one before it (lib/audit.ts). Refuses to run unless the
// app is in local (loopback) mode. The route only appends; it has no edit or delete.
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { ENGINE_CSRF_HEADER, ENGINE_CSRF_VALUE } from "@/lib/engine-csrf";
import { ACTOR, GENESIS, payload, type AuditEntry } from "@/lib/audit";
import { isLocalMode } from "@/lib/local-mode";
import { hostAllowed, originAllowed, readTextCapped } from "@/lib/server/local-guard";

export const dynamic = "force-dynamic";

/** Actions the app writes. Anything else is refused, so a stray caller cannot invent history. */
const ACTIONS = /^(map\.(created|removed|renamed)|step\.(added|removed|renamed|type|owner|partner)|param\.(added|added\.sop|changed|removed)|sop\.(added|removed|replaced)|data\.(added|removed)|campaign\.(upload|start|result|reanalyze)|sync\.migrated)$/;
const MAX_BODY = 64 * 1024;

const dir = () => process.env.KALOS_STATE_DIR || join(homedir(), ".kalos");
const file = () => join(dir(), "audit-log.jsonl");
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** Missing file = empty history. Any other read error is a failure: never present it as "empty", or the next write would start a second chain. */
async function load(): Promise<AuditEntry[]> {
  let raw: string;
  try {
    raw = await readFile(file(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: AuditEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as AuditEntry);
    } catch {
      // A damaged line stays out of the list; verification then reports the gap.
    }
  }
  return out;
}

async function endsWithoutNewline(): Promise<string> {
  try {
    const raw = await readFile(file(), "utf8");
    return raw.length > 0 && !raw.endsWith("\n") ? "\n" : "";
  } catch {
    return "";
  }
}

// Appends are serialised so two quick saves cannot read the same last hash.
let queue: Promise<unknown> = Promise.resolve();

export async function GET(): Promise<Response> {
  if (!isLocalMode()) return Response.json({ error: "Not available." }, { status: 404 });
  try {
    return Response.json({ entries: await load() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not read the history file." }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!isLocalMode()) return Response.json({ error: "Not available." }, { status: 404 });
  if (req.headers.get(ENGINE_CSRF_HEADER) !== ENGINE_CSRF_VALUE) return Response.json({ error: "Blocked." }, { status: 403 });
  const host = req.headers.get("host");
  if (!hostAllowed(host) || !originAllowed(req.headers.get("origin"), host)) return Response.json({ error: "Blocked." }, { status: 403 });

  const text = await readTextCapped(req, MAX_BODY);
  if (text === null) return Response.json({ error: "Too large." }, { status: 413 });
  let body: { events?: ({ action?: unknown; detail?: unknown } | null)[] };
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const events = (Array.isArray(body?.events) ? body.events : [])
    .filter((e): e is { action: string; detail: string } => !!e && typeof e.action === "string" && typeof e.detail === "string" && ACTIONS.test(e.action))
    .slice(0, 200)
    .map((e) => ({ action: e.action, detail: e.detail.slice(0, 1000) }));
  if (!events.length) return Response.json({ error: "No events." }, { status: 400 });

  const run = queue.then(async () => {
    const entries = await load();
    let prev = entries[entries.length - 1] ?? null;
    let text = "";
    for (const e of events) {
      const base = { seq: (prev?.seq ?? 0) + 1, at: new Date().toISOString(), actor: ACTOR, action: e.action, detail: e.detail, prev: prev?.hash ?? GENESIS };
      prev = { ...base, hash: sha(payload(base)) };
      text += `${JSON.stringify(prev)}\n`;
    }
    await mkdir(dir(), { recursive: true });
    // A crash can leave a last line without its newline; start on a fresh line so the new entry is not glued to it.
    const lead = await endsWithoutNewline();
    await appendFile(file(), lead + text, { mode: 0o600 });
    return events.length;
  });
  queue = run.catch(() => undefined);
  try {
    return Response.json({ ok: true, added: await run });
  } catch {
    return Response.json({ error: "Could not write the history file." }, { status: 500 });
  }
}
