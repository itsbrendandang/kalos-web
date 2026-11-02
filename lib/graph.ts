/*
 * Pure layout and wording for the Graph page, tested in __tests__/graph.test.ts.
 * The graph only restates what the engine returned: which inputs relate to the
 * target (and how strongly), and which inputs each proposed recipe varies.
 */
import type { PopulatedResult } from "@/lib/api";

export const GRAPH_W = 860;
export const GRAPH_H = 600;
const CX = GRAPH_W / 2;
const CY = GRAPH_H / 2;

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

  const nodes: GraphNode[] = [{ id: "target", kind: "target", label: a.target, x: CX, y: CY, r: 38, best: a.best ?? null, n: a.n }];
  const edges: GraphEdge[] = [];
  const angleOf = new Map<string, number>();

  inputs.forEach((name, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(1, inputs.length)) * Math.PI * 2;
    const p = polar(angle, 215, 160);
    const d = driverBy.get(name);
    const s = shapeBy.get(name);
    const rel = s ? s.relevance / maxRel : Math.abs(d?.rho ?? 0);
    angleOf.set(name, angle);
    nodes.push({
      id: `in:${name}`,
      kind: "input",
      label: name,
      ...p,
      r: 10 + rel * 12,
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
    nodes.push({ id: `p:${i}`, kind: "proposal", label: `Try ${i + 1}`, ...pos, r: 13, angle, mode: p.mode, pred: p.pred, std: p.std, reason: p.reason });
    for (const f of a.proposal_features) {
      if (angleOf.has(f)) edges.push({ id: `v:${i}:${f}`, from: `p:${i}`, to: `in:${f}`, kind: "varies", weight: 0.3, significant: false });
    }
  });

  // The simulation tools sit in the corners and link to what they work on. These
  // links are how the app is wired (open the tool, carry the idea over), not
  // results: no numbers are drawn from them.
  const TOOLS = [
    { id: "t:simulator", label: "Simulator", x: 780, y: 56, to: ordered.map((o) => `p:${o.i}`), href: "/library/simulator", blurb: "Replays the optimizer on a made-up problem with a known answer, so you can see how it searches before trusting it with your lab." },
    { id: "t:scaleup", label: "Scale-up", x: 80, y: 548, to: ["target"], href: "/library/scale-up", blurb: "Takes the recipe your result points to and predicts how it should behave at a larger scale." },
    { id: "t:vessels", label: "Vessels", x: 80, y: 56, to: ["target"], href: "/library/vessels", blurb: "Compares how the same process behaves in different bioreactors, which is where a recipe often changes." },
  ];
  for (const t of TOOLS) {
    nodes.push({ id: t.id, kind: "tool", label: t.label, x: t.x, y: t.y, r: 11, angle: t.x > CX ? 0 : Math.PI, href: t.href, blurb: t.blurb });
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

export function inputSentence(n: Extract<GraphNode, { kind: "input" }>): string {
  const parts: string[] = [];
  if (n.shape) parts.push(SHAPE_TEXT[n.shape]?.(n.optimumAt) ?? "");
  if (n.rho != null) {
    const dir = n.rho >= 0 ? "rises" : "falls";
    parts.push(`Across the runs, the result ${dir} as this goes up (correlation ${n.rho >= 0 ? "+" : "−"}${Math.abs(n.rho).toFixed(2)}${n.significant ? ", statistically solid" : ", not statistically solid"}).`);
  }
  if (!parts.length) parts.push("The engine reported nothing specific about this input.");
  return parts.filter(Boolean).join(" ");
}
