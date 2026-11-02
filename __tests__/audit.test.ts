import { describe, expect, it } from "vitest";
import { coalesce, diffMaps, makeEntry, verifyChain, type AuditEntry, type Hasher } from "@/lib/audit";
import { mabTemplate } from "@/lib/process";

const hash: Hasher = async (t) => {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
};
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("diffMaps", () => {
  it("records creation and removal", () => {
    expect(diffMaps(null, mabTemplate())[0].action).toBe("map.created");
    expect(diffMaps(mabTemplate(), null)[0].action).toBe("map.removed");
    expect(diffMaps(null, null)).toEqual([]);
  });
  it("sees nothing when nothing changed", () => { const m = mabTemplate(); expect(diffMaps(m, clone(m))).toEqual([]); });
  it("describes parameter, SOP and sheet changes", () => {
    const a = mabTemplate();
    const b = clone(a);
    const s = b.steps[2];
    s.params[0].high = 7.4;
    s.params.pop();
    s.sop = { name: "SOP-12.pdf", added: 1 };
    s.data.push({ name: "run1.csv", rows: 12, target: null, added: 2 });
    const acts = diffMaps(a, b).map((e) => e.action);
    expect(acts).toEqual(expect.arrayContaining(["param.changed", "param.removed", "sop.added", "data.added"]));
  });
  it("records steps added and removed", () => {
    const a = mabTemplate();
    const b = clone(a);
    const gone = b.steps.shift()!;
    expect(diffMaps(a, b)[0].detail).toContain(gone.name);
  });
});
describe("coalesce", () => {
  it("turns keystrokes into one rename and drops a no-op", () => {
    const a = mabTemplate();
    const evs = ["Hx", "Hxy", "Hxyz"].flatMap((n, i, arr) => { const p = clone(a); const q = clone(a); p.steps[0].name = i ? arr[i - 1] : a.steps[0].name; q.steps[0].name = n; return diffMaps(p, q); });
    const c = coalesce(evs);
    expect(c).toHaveLength(1);
    expect(c[0].detail).toBe(`Step renamed from "${a.steps[0].name}" to "Hxyz".`);
    const back = coalesce([{ action: "step.renamed", detail: "", key: "k", from: "a", to: "b" }, { action: "step.renamed", detail: "", key: "k", from: "b", to: "a" }]);
    expect(back).toEqual([]);
  });
});
describe("chain", () => {
  const build = async () => {
    const out: AuditEntry[] = [];
    for (const d of ["one", "two", "three"]) out.push(await makeEntry(out[out.length - 1] ?? null, { action: "x", detail: d }, new Date(2026, 0, 1), hash));
    return out;
  };
  it("verifies an intact chain", async () => expect(await verifyChain(await build(), hash)).toEqual({ ok: true }));
  it("catches an edited entry", async () => {
    const c = await build(); c[1] = { ...c[1], detail: "changed" };
    expect(await verifyChain(c, hash)).toMatchObject({ ok: false, seq: 2 });
  });
  it("catches a deleted entry", async () => {
    const c = await build(); c.splice(1, 1);
    expect(await verifyChain(c, hash)).toMatchObject({ ok: false, seq: 3 });
  });
});
