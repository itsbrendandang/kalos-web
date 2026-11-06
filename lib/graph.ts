/*
 * Pure layout and wording for the Graph page, tested in __tests__/graph.test.ts.
 * The graph only restates what Kalos returned: which inputs went with the
 * target (and how strongly), and which inputs each proposed recipe changes.
 * Every node is the same size; an input's importance is its distance from the
 * result (closer = moves more closely with it), never its area.
 */
import type { PopulatedResult } from "@/lib/api";

export const GRAPH_W = 860;
export const GRAPH_H = 600;
const CX = GRAPH_W / 2;
const CY = GRAPH_H / 2;
/** One radius for every node but the hub, so size never reads as importance. */
export const NODE_R = 12;
export const HUB_R = 30;
/** Inputs sit between these distances from the hub, the same in every direction: the most relevant is nearest. */
const INPUT_NEAR = 100;
const INPUT_FAR = 225;

export type GraphNode =
  | { id: string; kind: "target"; label: string; x: number; y: number; r: number; best: number | null; n: number }
  | {
      id: string;
      kind: "input";
      label: string;
      x: number;
      y: number;
      r: number;
      angle: number;
      rho: number | null;
      significant: boolean;
      relevance: number | null;
      shape: string | null;
      optimumAt: number | null;
    }
  | { id: string; kind: "tool"; label: string; x: number; y: number; r: number; angle: number; href: string; blurb: string }
  | { id: string; kind: "proposal"; label: string; x: number; y: number; r: number; angle: number; mode: "explore" | "exploit"; pred: number; std: number; reason: string };

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  kind: "driver" | "varies" | "simulates";
  /** 0..1, how strong the link is drawn. */
  weight: number;
  significant: boolean;
};

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

const polar = (angle: number, rx: number, ry: number) => ({ x: CX + Math.cos(angle) * rx, y: CY + Math.sin(angle) * ry });

/** Mean of angles (radians) that handles wrap-around. */
export function circularMean(angles: readonly number[]): number {
  const s = angles.reduce((a, t) => a + Math.sin(t), 0);
  const c = angles.reduce((a, t) => a + Math.cos(t), 0);
  return Math.atan2(s, c);
}

export function buildGraph(a: PopulatedResult): Graph {
  const driverBy = new Map(a.drivers.map((d) => [d.name, d]));
  const shapeBy = new Map((a.gp_shapes?.available ? a.gp_shapes.features : []).map((f) => [f.name, f]));
  const maxRel = Math.max(0.0001, ...[...shapeBy.values()].map((f) => f.relevance));

  // Most influential first, clockwise from the top.
  const inputs = [...a.features].sort((x, y) => {
    const rx = shapeBy.get(x)?.relevance ?? Math.abs(driverBy.get(x)?.rho ?? 0);
    const ry = shapeBy.get(y)?.relevance ?? Math.abs(driverBy.get(y)?.rho ?? 0);
    return ry - rx;
  });

  const nodes: GraphNode[] = [{ id: "target", kind: "target", label: a.target, x: CX, y: CY, r: HUB_R, best: a.best ?? null, n: a.n }];
  const edges: GraphEdge[] = [];
  const angleOf = new Map<string, number>();

  inputs.forEach((name, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(1, inputs.length)) * Math.PI * 2;
    const d = driverBy.get(name);
    const s = shapeBy.get(name);
    const rel = Math.max(0, Math.min(1, s ? s.relevance / maxRel : Math.abs(d?.rho ?? 0)));
    // Closer to the hub = moves more closely with the result.
    const dist = INPUT_FAR - rel * (INPUT_FAR - INPUT_NEAR);
    const p = polar(angle, dist, dist);
    angleOf.set(name, angle);
    nodes.push({
      id: `in:${name}`,
      kind: "input",
      label: name,
      ...p,
      r: NODE_R,
      angle,
      rho: d?.rho ?? null,
      significant: d?.significant ?? false,
      relevance: s?.relevance ?? null,
      shape: s?.shape ?? null,
      optimumAt: s?.optimum_at ?? null,
    });
    // A link to the target only where the engine reported a driver or a shape.
    if (d || s) {
      edges.push({ id: `e:${name}`, from: `in:${name}`, to: "target", kind: "driver", weight: Math.max(0.15, Math.min(1, d ? Math.abs(d.rho) * 2 : rel)), significant: d?.significant ?? false });
    }
  });

  const props = a.proposals.map((p, i) => ({ p, i, angle: circularMean(a.proposal_features.filter((f) => angleOf.has(f)).map((f) => angleOf.get(f)!)) }));
  // Evenly spaced on the outer ring, in the order of the inputs they lean on.
  const ordered = [...props].sort((x, y) => x.angle - y.angle);
  ordered.forEach(({ p, i }, k) => {
    const angle = -Math.PI / 2 + Math.PI / ordered.length + (k / Math.max(1, ordered.length)) * Math.PI * 2;
    const pos = polar(angle, 380, 262);
    nodes.push({ id: `p:${i}`, kind: "proposal", label: `Try ${i + 1}`, ...pos, r: NODE_R, angle, mode: p.mode, pred: p.pred, std: p.std, reason: p.reason });
    for (const f of a.proposal_features) {
      if (angleOf.has(f)) edges.push({ id: `v:${i}:${f}`, from: `p:${i}`, to: `in:${f}`, kind: "varies", weight: 0.3, significant: false });
    }
  });

  // The simulation tools sit in the corners and link to what they work on. These
  // links are how the app is wired (open the tool, carry the idea over), not
  // results: no numbers are drawn from them.
  const TOOLS = [
    { id: "t:simulator", label: "Benchmark", x: 740, y: 56, to: ordered.map((o) => `p:${o.i}`), href: "/library/simulator", blurb: "Watches Kalos search a made-up problem with one known best recipe, so you can see how it searches before trusting it with your lab." },
    { id: "t:scaleup", label: "Scale-up", x: 80, y: 548, to: ["target"], href: "/library/scale-up", blurb: "Takes the recipe your result points to and asks what it would do at a larger scale." },
  ];
  for (const t of TOOLS) {
    nodes.push({ id: t.id, kind: "tool", label: t.label, x: t.x, y: t.y, r: NODE_R, angle: t.x > CX ? 0 : Math.PI, href: t.href, blurb: t.blurb });
    for (const to of t.to) edges.push({ id: `s:${t.id}:${to}`, from: t.id, to, kind: "simulates", weight: 0.3, significant: false });
  }
  return { nodes, edges };
}

const SHAPE_TEXT: Record<string, (at: number | null) => string> = {
  interior_optimum: (at) => (at != null ? `Best near ${Number(at.toPrecision(4))}; too high or too low is worse.` : "Has a sweet spot in the middle."),
  interior_minimum: () => "Worst in the middle; better at either end.",
  monotonic_up: () => "Higher tends to be better.",
  monotonic_down: () => "Lower tends to be better.",
  flat: () => "Little effect in this data.",
};

/** How strongly an input went with the target, in words: the number itself stays one click down. */
export function strengthWord(rho: number): string {
  const r = Math.abs(rho);
  return r >= 0.5 ? "strongly" : r >= 0.25 ? "somewhat" : "only a little";
}

/** "Clear signal" or "Could be chance": the badge words for whether a link could be chance alone. */
export const signalWord = (significant: boolean): string => (significant ? "clear signal" : "could be chance");

/** One line per input for the ranked list under the verdict: direction, strength, and whether it could be chance. */
export function linkLine(n: Pick<Extract<GraphNode, { kind: "input" }>, "rho" | "significant">, target: string): string {
  if (n.rho == null) return `nothing reported about how it went with ${target}`;
  const dir = n.rho >= 0 ? `went with higher ${target}` : `went with lower ${target}`;
  return `${dir} ${strengthWord(n.rho)}; ${signalWord(n.significant)}`;
}

export function inputSentence(n: Extract<GraphNode, { kind: "input" }>): string {
  const parts: string[] = [];
  if (n.shape) parts.push(SHAPE_TEXT[n.shape]?.(n.optimumAt) ?? "");
  if (n.rho != null) {
    const dir = n.rho >= 0 ? "higher" : "lower";
    parts.push(`Across the runs, more of this went with a ${dir} result, ${strengthWord(n.rho)}. ${n.significant ? "Clear signal." : "Could be chance."}`);
  }
  if (!parts.length) parts.push("Kalos reported nothing specific about this input.");
  return parts.filter(Boolean).join(" ");
}

/**
 * The page's one sentence: the result, its best measured value, and the
 * inputs that went most closely with it (the two with the largest link that
 * is a clear signal, else the two drawn nearest the hub).
 */
export function graphSentence(a: PopulatedResult, g: Graph): string {
  const head = a.best != null ? `${a.target}: best measured ${formatPlain(a.best)} from ${a.n} runs.` : `${a.target}: ${a.n} runs, no measured best yet.`;
  const inputs = g.nodes.filter((n): n is Extract<GraphNode, { kind: "input" }> => n.kind === "input");
  const solid = inputs.filter((n) => n.significant);
  const lead = (solid.length ? solid : inputs).slice(0, 2).map((n) => n.label);
  if (!lead.length) return head;
  const who = lead.length === 2 ? `${lead[0]} and ${lead[1]} went` : `${lead[0]} went`;
  return `${head} ${who} most closely with it${solid.length ? "" : ", though every link could be chance"}.`;
}

const formatPlain = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));
