/*
 * Append-only change log for the process map. Every entry carries the hash of
 * the one before it, so editing or deleting an old entry is detectable. This is
 * tamper-evident on one device, not tamper-proof: someone with access to the
 * browser's storage can rewrite the whole chain. It is research-use record
 * keeping, not a 21 CFR Part 11 system (no e-signatures, no validation).
 * Tested in __tests__/audit.test.ts.
 */
import type { ProcessMap, Step } from "@/lib/process";
import { LOCAL_LABEL } from "@/lib/viewer";

export type AuditEvent = {
  action: string;
  detail: string;
  /** Events with the same key inside one flush are merged (typing a name is one change, not twenty). */
  key?: string;
  from?: string;
  to?: string;
};

export type AuditEntry = {
  seq: number;
  at: string;
  actor: string;
  action: string;
  detail: string;
  prev: string;
  hash: string;
};

export const GENESIS = "0".repeat(64);

/** Entries written before each change carried a person's name. They say "this device", which was never a person. */
export const LEGACY_ACTOR = "this device";

/** The line under a change in the activity log. Old entries keep their stored text (their hash covers it); only the wording here differs. */
export function actorCaption(actor: string): string {
  if (actor === LEGACY_ACTOR) return "Who made this change was not recorded (earlier entry)";
  if (actor === LOCAL_LABEL) return "Made in local mode, no sign-in";
  return `Made by ${actor}`;
}

const range = (p: { low: number | null; high: number | null; unit: string }) =>
  `${p.low === p.high ? p.low : `${p.low} to ${p.high}`} ${p.unit}`.trim();

/** What changed between two versions of the map, in words a person can read later. */
export function diffMaps(prev: ProcessMap | null, next: ProcessMap | null): AuditEvent[] {
  if (!prev && !next) return [];
  if (!next) return [{ action: "map.removed", detail: "Removed the whole process map from this device." }];
  if (!prev) return [{ action: "map.created", detail: `Created process "${next.name}" with ${next.steps.length} step${next.steps.length === 1 ? "" : "s"}.` }];
  const out: AuditEvent[] = [];
  if (prev.name !== next.name) out.push({ action: "map.renamed", detail: "", key: "map.name", from: prev.name, to: next.name });
  const before = new Map(prev.steps.map((s) => [s.id, s]));
  const after = new Map(next.steps.map((s) => [s.id, s]));
  for (const s of next.steps) if (!before.has(s.id)) out.push({ action: "step.added", detail: `Added step "${s.name}".` });
  for (const s of prev.steps) if (!after.has(s.id)) out.push({ action: "step.removed", detail: `Removed step "${s.name}".` });
  for (const s of next.steps) {
    const o = before.get(s.id);
    if (o) out.push(...diffStep(o, s));
  }
  return out;
}

function diffStep(o: Step, s: Step): AuditEvent[] {
  const out: AuditEvent[] = [];
  const at = `"${s.name}"`;
  if (o.name !== s.name) out.push({ action: "step.renamed", detail: "", key: `name:${s.id}`, from: o.name, to: s.name });
  if (o.kind !== s.kind) out.push({ action: "step.type", detail: `${at}: type changed from ${o.kind} to ${s.kind}.` });
  if (o.owner !== s.owner) out.push({ action: "step.owner", detail: `${at}: run by changed from ${o.owner} to ${s.owner}.` });
  if (o.partner !== s.partner) out.push({ action: "step.partner", detail: "", key: `partner:${s.id}`, from: o.partner, to: s.partner });
  const op = new Map(o.params.map((p) => [p.id, p]));
  const np = new Map(s.params.map((p) => [p.id, p]));
  for (const p of s.params) {
    const q = op.get(p.id);
    if (!q) out.push({ action: p.source === "sop" ? "param.added.sop" : "param.added", detail: `${at}: added ${p.name}, ${range(p)}${p.source === "sop" ? " (read from an SOP and confirmed)" : ""}.` });
    else if (q.low !== p.low || q.high !== p.high || q.unit !== p.unit || q.name !== p.name) out.push({ action: "param.changed", detail: `${at}: ${q.name} changed from ${range(q)} to ${p.name} ${range(p)}.` });
  }
  for (const p of o.params) if (!np.has(p.id)) out.push({ action: "param.removed", detail: `${at}: removed ${p.name}.` });
  if (!o.sop && s.sop) out.push({ action: "sop.added", detail: `${at}: attached SOP "${s.sop.name}".` });
  if (o.sop && !s.sop) out.push({ action: "sop.removed", detail: `${at}: removed SOP "${o.sop.name}".` });
  if (o.sop && s.sop && o.sop.added !== s.sop.added) out.push({ action: "sop.replaced", detail: `${at}: replaced SOP "${o.sop.name}" with "${s.sop.name}".` });
  const key = (d: { name: string; added: number }) => `${d.name}@${d.added}`;
  const od = new Set(o.data.map(key));
  const nd = new Set(s.data.map(key));
  for (const d of s.data) if (!od.has(key(d))) out.push({ action: "data.added", detail: `${at}: added sheet "${d.name}" (${d.rows} runs).` });
  for (const d of o.data) if (!nd.has(key(d))) out.push({ action: "data.removed", detail: `${at}: removed sheet "${d.name}".` });
  return out;
}

/** Merge same-key events (first "from", last "to") and drop a rename that ended where it began. */
export function coalesce(events: AuditEvent[]): AuditEvent[] {
  const out: AuditEvent[] = [];
  const at = new Map<string, number>();
  for (const e of events) {
    if (!e.key) { out.push(e); continue; }
    const i = at.get(e.key);
    if (i == null) { at.set(e.key, out.length); out.push({ ...e }); }
    else out[i] = { ...out[i], to: e.to };
  }
  return out
    .filter((e) => !(e.key && e.from === e.to))
    .map((e) => (e.key ? { action: e.action, detail: describeChange(e) } : e));
}

function describeChange(e: AuditEvent): string {
  const q = (v?: string) => (v ? `"${v}"` : "(empty)");
  const what = e.action === "map.renamed" ? "Process" : e.action === "step.partner" ? "Partner" : "Step";
  return `${what} renamed from ${q(e.from)} to ${q(e.to)}.`.replace("Partner renamed", "Partner changed");
}

export type Hasher = (text: string) => Promise<string>;

export const payload = (e: Pick<AuditEntry, "seq" | "at" | "actor" | "action" | "detail" | "prev">) =>
  JSON.stringify([e.seq, e.at, e.actor, e.action, e.detail, e.prev]);

/** `actor` is who made the change: the signed-in user's name, or LOCAL_LABEL in local mode. */
export async function makeEntry(prev: AuditEntry | null, ev: AuditEvent, now: Date, hash: Hasher, actor: string): Promise<AuditEntry> {
  const base = { seq: (prev?.seq ?? 0) + 1, at: now.toISOString(), actor, action: ev.action, detail: ev.detail, prev: prev?.hash ?? GENESIS };
  return { ...base, hash: await hash(payload(base)) };
}

/** Recompute every hash. Returns the first entry that does not match, or null when the whole chain holds. */
export async function verifyChain(entries: AuditEntry[], hash: Hasher): Promise<{ ok: true } | { ok: false; seq: number; why: string }> {
  let prev = GENESIS;
  let n = 0;
  for (const e of entries) {
    n++;
    if (e.seq !== n) return { ok: false, seq: e.seq, why: "An entry is missing or out of order." };
    if (e.prev !== prev) return { ok: false, seq: e.seq, why: "This entry does not follow the one before it." };
    if ((await hash(payload(e))) !== e.hash) return { ok: false, seq: e.seq, why: "This entry was changed after it was written." };
    prev = e.hash;
  }
  return { ok: true };
}
