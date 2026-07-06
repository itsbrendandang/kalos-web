"use client";

import { useState } from "react";
import { GitBranch } from "lucide-react";

type NodeType = "root" | "bo-exp" | "bo-expl" | "bo-expl2" | "val" | "promote" | "hold";

interface TNode {
  key: string;
  label: string;
  name: string;
  type: NodeType;
  x: number;
  y: number;
  r: number;
  star?: boolean;
  pid?: string;
  yieldLabel?: string;
  cond?: [string, string, string, string];
  result?: string;
  notes: string;
  lineageParent?: string;
  lineageChildren?: string;
}

interface Band {
  y: number;
  lineY: number;
  text: string;
  blue?: boolean;
  dashed?: boolean;
}

// Node-color dictionary for the experiment lineage SVG. Kept as a self-contained
// constant (rather than CSS classes) because each node type maps to a fixed
// fill/stroke/text/badge combination that is only ever read here, and the SVG
// nodes are drawn imperatively - see DESIGN.md ("Linkage tree" exception).
const STYLE: Record<NodeType, { fill: string; stroke: string; text: string; badge: string; badgeLabel: string }> = {
  root: { fill: "#C5CAE9", stroke: "#9FA8DA", text: "#283593", badge: "#C5CAE9", badgeLabel: "LHS batch" },
  "bo-exp": { fill: "#C8E6C9", stroke: "#A5D6A7", text: "#1B5E20", badge: "#C8E6C9", badgeLabel: "BO Explore" },
  "bo-expl": { fill: "#B2DFDB", stroke: "#80CBC4", text: "#004D40", badge: "#B2DFDB", badgeLabel: "BO Explore II" },
  "bo-expl2": { fill: "#BBDEFB", stroke: "#90CAF9", text: "#0D47A1", badge: "#BBDEFB", badgeLabel: "BO Exploit" },
  val: { fill: "#FFF9C4", stroke: "#F9A825", text: "#E65100", badge: "#FFF9C4", badgeLabel: "Phase 2 validation" },
  promote: { fill: "#A5D6A7", stroke: "#4CAF50", text: "#1B5E20", badge: "#A5D6A7", badgeLabel: "Promote" },
  hold: { fill: "#FFE082", stroke: "#FFC107", text: "#5D4037", badge: "#FFE082", badgeLabel: "Hold" },
};

const P1_BANDS: Band[] = [
  { y: 15, lineY: 20, text: "ITER 1 — LHS" },
  { y: 105, lineY: 110, text: "ITER 2 — BO EXPLORE" },
  { y: 215, lineY: 220, text: "ITER 3 — BO EXPLORE" },
  { y: 340, lineY: 345, text: "ITER 4 — BO EXPLOIT" },
];

const P1_NODES: TNode[] = [
  { key: "ROOT", label: "LHS", name: "LHS seed batch (30 runs)", type: "root", x: 180, y: 58, r: 13, yieldLabel: "30 runs", notes: "30-run LHS opened the design space across all 4 conditions." },
  { key: "031", label: "031", name: "BO Explore · A", type: "bo-exp", x: 95, y: 140, r: 11, pid: "ROOT", cond: ["3.50", "150", "2.0", "41"], result: "87.4", yieldLabel: "87.4%", notes: "BO iter 2, LHS peak region.", lineageParent: "EXP-ROOT", lineageChildren: "EXP-034, EXP-037" },
  { key: "032", label: "032", name: "BO Explore · B", type: "bo-exp", x: 180, y: 140, r: 11, pid: "ROOT", cond: ["3.52", "155", "2.1", "42"], result: "91.2", yieldLabel: "91.2%", notes: "BO iter 2, highest yield iter 2.", lineageParent: "EXP-ROOT", lineageChildren: "EXP-035, EXP-038" },
  { key: "033", label: "033", name: "BO Explore · C", type: "bo-exp", x: 265, y: 140, r: 11, pid: "ROOT", cond: ["3.46", "165", "1.8", "40"], result: "85.1", yieldLabel: "85.1%", notes: "BO iter 2, uncertainty probe.", lineageParent: "EXP-ROOT", lineageChildren: "EXP-036" },
  { key: "034", label: "034", name: "BO Explore II · A", type: "bo-expl", x: 65, y: 264, r: 11, pid: "031", cond: ["3.51", "152", "2.0", "42"], result: "92.4", yieldLabel: "92.4%", notes: "Iter 3, refined from 031.", lineageParent: "EXP-031", lineageChildren: "EXP-041, EXP-042" },
  { key: "035", label: "035", name: "BO Explore II · B", type: "bo-expl", x: 140, y: 264, r: 11, pid: "032", cond: ["3.53", "150", "2.1", "41"], result: "92.7", yieldLabel: "92.7%", notes: "Iter 3, peak candidate from 032.", lineageParent: "EXP-032", lineageChildren: "EXP-043" },
  { key: "036", label: "036", name: "BO Explore II · C", type: "bo-expl", x: 198, y: 264, r: 11, pid: "032", cond: ["3.49", "158", "1.9", "41"], result: "90.8", yieldLabel: "90.8%", notes: "Iter 3, second branch from 032.", lineageParent: "EXP-032", lineageChildren: "EXP-044" },
  { key: "037", label: "037", name: "BO Explore II · D", type: "bo-expl", x: 265, y: 264, r: 11, pid: "031", cond: ["3.48", "162", "2.2", "43"], result: "89.3", yieldLabel: "89.3%", notes: "Iter 3, branch from 031.", lineageParent: "EXP-031", lineageChildren: "EXP-045" },
  { key: "038", label: "038", name: "BO Explore II · E", type: "bo-expl", x: 325, y: 264, r: 11, pid: "033", cond: ["3.42", "170", "1.7", "39"], result: "84.2", yieldLabel: "84.2%", notes: "Iter 3, uncertainty probe from 033.", lineageParent: "EXP-033" },
  { key: "041", label: "041", name: "BO Exploit · A", type: "bo-expl2", x: 50, y: 394, r: 10, pid: "034", cond: ["3.51", "151", "2.0", "42"], result: "93.1", yieldLabel: "93.1%", notes: "Exploit, converging on optimum.", lineageParent: "EXP-034" },
  { key: "042", label: "042", name: "BO Exploit · B ★ Best", type: "bo-expl2", x: 110, y: 394, r: 13, star: true, pid: "034", cond: ["3.52", "152", "2.1", "42"], result: "93.8", yieldLabel: "★ best", notes: "Exploit, highest yield across all iterations. Primary Phase 2 candidate.", lineageParent: "EXP-034" },
  { key: "043", label: "043", name: "BO Exploit · C", type: "bo-expl2", x: 165, y: 394, r: 10, pid: "035", cond: ["3.53", "149", "2.1", "41"], result: "92.9", yieldLabel: "92.9%", notes: "Exploit, confirms 042 peak.", lineageParent: "EXP-035" },
  { key: "044", label: "044", name: "BO Exploit · D", type: "bo-expl2", x: 225, y: 394, r: 10, pid: "036", cond: ["3.49", "159", "1.9", "41"], result: "90.5", yieldLabel: "90.5%", notes: "Exploit, robustness check.", lineageParent: "EXP-036" },
  { key: "045", label: "045", name: "BO Exploit · E", type: "bo-expl2", x: 285, y: 394, r: 10, pid: "037", cond: ["3.47", "163", "2.2", "43"], result: "89.7", yieldLabel: "89.7%", notes: "Exploit, high NaCl, diminishing returns.", lineageParent: "EXP-037" },
];

const P1_LEGEND = [
  { c: "#C5CAE9", t: "LHS (iter 1)" },
  { c: "#C8E6C9", t: "BO Explore (iter 2)" },
  { c: "#B2DFDB", t: "BO Explore (iter 3)" },
  { c: "#BBDEFB", t: "BO Exploit · ★ best", border: "#204AF4" },
];

const P2_BANDS: Band[] = [
  { y: 15, lineY: 20, text: "PHASE 1 — ITERATIONS 1–4" },
  { y: 385, lineY: 391, text: "PHASE 2 — SCALE-UP VALIDATION", blue: true, dashed: true },
];

const P2_NODES: TNode[] = [
  { key: "ROOT", label: "LHS", name: "LHS seed batch", type: "root", x: 180, y: 50, r: 12, notes: "30-run LHS opened the design space." },
  { key: "031", label: "031", name: "BO Explore · A", type: "bo-exp", x: 105, y: 112, r: 10, pid: "ROOT", cond: ["3.50", "150", "2.0", "41"], result: "87.4", notes: "BO iter 2, LHS peak region.", lineageParent: "EXP-ROOT", lineageChildren: "EXP-034" },
  { key: "032", label: "032", name: "BO Explore · B", type: "bo-exp", x: 180, y: 112, r: 10, pid: "ROOT", cond: ["3.52", "155", "2.1", "42"], result: "91.2", notes: "BO iter 2, highest yield iter 2.", lineageParent: "EXP-ROOT", lineageChildren: "EXP-035, EXP-036" },
  { key: "033", label: "033", name: "BO Explore · C", type: "bo-exp", x: 255, y: 112, r: 10, pid: "ROOT", cond: ["3.46", "165", "1.8", "40"], result: "85.1", notes: "BO iter 2, uncertainty probe.", lineageParent: "EXP-ROOT", lineageChildren: "EXP-037" },
  { key: "034", label: "034", name: "BO Explore II · A", type: "bo-expl", x: 80, y: 202, r: 10, pid: "031", cond: ["3.51", "152", "2.0", "42"], result: "92.4", notes: "Iter 3, refined from 031.", lineageParent: "EXP-031", lineageChildren: "EXP-041, EXP-042" },
  { key: "035", label: "035", name: "BO Explore II · B", type: "bo-expl", x: 150, y: 202, r: 10, pid: "032", cond: ["3.53", "150", "2.1", "41"], result: "92.7", notes: "Iter 3, peak candidate.", lineageParent: "EXP-032", lineageChildren: "EXP-043" },
  { key: "036", label: "036", name: "BO Explore II · C", type: "bo-expl", x: 208, y: 202, r: 10, pid: "032", cond: ["3.49", "158", "1.9", "41"], result: "90.8", notes: "Iter 3, second branch from 032.", lineageParent: "EXP-032" },
  { key: "037", label: "037", name: "BO Explore II · D", type: "bo-expl", x: 268, y: 202, r: 10, pid: "033", cond: ["3.48", "162", "2.2", "43"], result: "89.3", notes: "Iter 3, branch from 033.", lineageParent: "EXP-033" },
  { key: "041", label: "041", name: "BO Exploit · A", type: "bo-expl2", x: 60, y: 304, r: 9, pid: "034", cond: ["3.51", "151", "2.0", "42"], result: "93.1", notes: "Exploit, strong candidate.", lineageParent: "EXP-034", lineageChildren: "VAL-001" },
  { key: "042", label: "042", name: "BO Exploit · B ★", type: "bo-expl2", x: 118, y: 304, r: 12, star: true, pid: "034", cond: ["3.52", "152", "2.1", "42"], result: "93.8", notes: "Exploit, highest yield, primary candidate.", lineageParent: "EXP-034", lineageChildren: "VAL-002, VAL-003" },
  { key: "043", label: "043", name: "BO Exploit · C", type: "bo-expl2", x: 175, y: 304, r: 9, pid: "035", cond: ["3.53", "149", "2.1", "41"], result: "92.9", notes: "Exploit, confirms 042 peak.", lineageParent: "EXP-035", lineageChildren: "VAL-004" },
  { key: "044", label: "044", name: "BO Exploit · D", type: "bo-expl2", x: 230, y: 304, r: 9, pid: "036", cond: ["3.49", "159", "1.9", "41"], result: "90.5", notes: "Exploit, robustness check.", lineageParent: "EXP-036" },
  { key: "VAL-001", label: "V-001", name: "P2 validation · A", type: "val", x: 60, y: 422, r: 11, pid: "041", cond: ["3.51", "151", "2.0", "42"], result: "93.3", yieldLabel: "93.3%", notes: "2L bench, confirms 041.", lineageParent: "EXP-041" },
  { key: "VAL-002", label: "V-002", name: "P2 validation · B", type: "val", x: 130, y: 422, r: 11, pid: "042", cond: ["3.52", "152", "2.1", "42"], result: "93.9", yieldLabel: "93.9%", notes: "2L bench, confirms 042 best.", lineageParent: "EXP-042", lineageChildren: "VAL-005" },
  { key: "VAL-003", label: "V-003", name: "P2 validation · C", type: "val", x: 200, y: 422, r: 11, pid: "042", cond: ["3.54", "150", "2.2", "43"], result: "92.1", yieldLabel: "92.1%", notes: "2L bench, slight variation from 042.", lineageParent: "EXP-042" },
  { key: "VAL-004", label: "V-004", name: "P2 validation · D", type: "val", x: 268, y: 422, r: 11, pid: "043", cond: ["3.53", "149", "2.1", "41"], result: "92.8", yieldLabel: "92.8%", notes: "2L bench, from 043 peak.", lineageParent: "EXP-043" },
  { key: "VAL-005", label: "V-005", name: "P2 validation · E (50L pilot)", type: "promote", x: 127, y: 514, r: 12, pid: "VAL-002", cond: ["3.52", "152", "2.1", "42"], result: "93.4", yieldLabel: "Promote", notes: "50L pilot confirms 2L result. Pipeline decision: Promote.", lineageParent: "VAL-002" },
  { key: "C-01", label: "C-01", name: "Pipeline decision · C-01", type: "hold", x: 60, y: 514, r: 11, pid: "041", cond: ["3.51", "151", "2.0", "42"], result: "93.3", yieldLabel: "Hold", notes: "Hold, insufficient 50L replicates.", lineageParent: "EXP-041" },
];

const P2_LEGEND = [
  { c: "#C5CAE9", t: "LHS" },
  { c: "#C8E6C9", t: "BO Explore" },
  { c: "#BBDEFB", t: "BO Exploit ★", border: "#204AF4" },
  { c: "#FFF9C4", t: "P2 validation", border: "#F9A825" },
  { c: "#A5D6A7", t: "Promote", border: "#4CAF50" },
  { c: "#FFE082", t: "Hold", border: "#FFC107" },
];

function Edge({ from, to }: { from: TNode; to: TNode }) {
  const dashedBlue = to.type === "val";
  const dashedGray = to.type === "hold";
  const stroke = dashedBlue ? "rgba(32,74,244,.35)" : "rgba(17,17,17,.14)";
  return (
    <line
      x1={from.x}
      y1={from.y + from.r}
      x2={to.x}
      y2={to.y - to.r}
      stroke={stroke}
      strokeWidth={dashedBlue ? 1.5 : 1}
      strokeDasharray={dashedBlue || dashedGray ? "4,3" : undefined}
    />
  );
}

function TreeSvg({
  nodes,
  bands,
  height,
  onSelect,
  selectedKey,
}: {
  nodes: TNode[];
  bands: Band[];
  height: number;
  onSelect: (n: TNode) => void;
  selectedKey: string | null;
}) {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  return (
    <svg viewBox={`0 0 360 ${height}`} xmlns="http://www.w3.org/2000/svg" className="block w-full">
      {bands.map((b) => (
        <g key={b.text}>
          <text x={8} y={b.y} fontSize={9} fontWeight={500} fill={b.blue ? "rgba(32,74,244,.55)" : "rgba(17,17,17,.28)"} letterSpacing={1}>
            {b.text}
          </text>
          <line
            x1={0}
            y1={b.lineY}
            x2={360}
            y2={b.lineY}
            stroke={b.blue ? "rgba(32,74,244,.2)" : "rgba(17,17,17,.06)"}
            strokeWidth={b.dashed ? 1 : 0.5}
            strokeDasharray={b.dashed ? "4,3" : undefined}
          />
        </g>
      ))}
      {nodes.map((n) => {
        const parent = n.pid ? byKey.get(n.pid) : undefined;
        return parent ? <Edge key={`e-${n.key}`} from={parent} to={n} /> : null;
      })}
      {nodes.map((n) => {
        const st = STYLE[n.type];
        const isBest = n.star;
        const selected = selectedKey === n.key;
        return (
          <g key={n.key} className="cursor-pointer" onClick={() => onSelect(n)}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={st.fill}
              stroke={isBest || selected ? "var(--v-blue)" : st.stroke}
              strokeWidth={isBest || selected ? 2 : 1.5}
            />
            <text x={n.x} y={n.y + 3} textAnchor="middle" fontSize={n.type === "root" ? 9 : 8} fontWeight={500} fill={st.text}>
              {n.label}
            </text>
            {n.yieldLabel ? (
              <text
                x={n.x}
                y={n.y + n.r + 12}
                textAnchor="middle"
                fontSize={8}
                fontWeight={isBest || n.type === "promote" || n.type === "hold" ? 500 : 400}
                fill={
                  isBest
                    ? "var(--v-blue)"
                    : n.type === "promote"
                      ? "var(--v-green)"
                      : n.type === "hold"
                        ? STYLE.hold.text
                        : "rgba(17,17,17,.4)"
                }
              >
                {n.yieldLabel}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function Detail({ n }: { n: TNode | null }) {
  if (!n) {
    return (
      <div className="det-empty">
        <GitBranch className="size-6 text-[color:rgba(17,17,17,0.14)]" />
        <div>Click any node to inspect</div>
      </div>
    );
  }
  const st = STYLE[n.type];
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[1px] text-[color:var(--v-muted)]">
        {n.key === "ROOT" ? "EXP-ROOT" : n.key.startsWith("V-") || n.key.startsWith("VAL") || n.key.startsWith("C-") ? n.key : `EXP-${n.key}`}
      </div>
      <div className="mb-1.5 text-[13px] font-bold tracking-[-0.2px] text-[color:var(--v-ink)]">{n.name}</div>
      <span
        className="mb-2.5 inline-flex rounded-full px-[7px] py-0.5 text-[10px] font-medium"
        style={{ background: st.badge, color: "rgba(17,17,17,.7)" }}
      >
        {st.badgeLabel}
      </span>
      {n.cond ? (
        <>
          <div className="dc-detail-label">Conditions</div>
          <div className="cond-grid">
            {(["pH elution", "NaCl mM", "Flow mL/min", "DO₂ %"] as const).map((lbl, i) => (
              <div key={lbl} className="cond-cell">
                <div className="cond-lbl">{lbl}</div>
                <div className="cond-val">{n.cond![i]}</div>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {n.result ? (
        <div className="mb-2 flex items-baseline gap-1.5 rounded-[7px] border-[0.5px] border-[color:var(--v-border)] bg-[var(--v-bg)] px-2 py-2">
          <span className="text-[11px] text-[color:var(--v-muted)]">Yield</span>
          <span className="text-[19px] font-bold leading-none text-[color:var(--v-blue)]">{n.result}</span>
          <span className="text-[11px] text-[color:var(--v-muted)]">%</span>
        </div>
      ) : null}
      <div className="dc-detail-label mt-1">Notes</div>
      <div className="mb-2.5 text-[11px] leading-[1.6] text-[color:var(--v-muted)]">{n.notes}</div>
      {n.lineageParent || n.lineageChildren ? (
        <>
          <div className="dc-detail-label">Lineage</div>
          {n.lineageParent ? (
            <div className="lin-item">
              <span className="lin-dot" style={{ background: STYLE.root.fill }} />
              <span className="flex-1 font-medium text-[color:var(--v-ink)]">{n.lineageParent}</span>
              <span className="text-[10px] text-[color:var(--v-muted)]">Parent</span>
            </div>
          ) : null}
          {n.lineageChildren
            ? n.lineageChildren.split(",").map((c) => (
                <div key={c} className="lin-item">
                  <span className="lin-dot" style={{ background: STYLE["bo-expl2"].fill }} />
                  <span className="flex-1 font-medium text-[color:var(--v-ink)]">{c.trim()}</span>
                  <span className="text-[10px] text-[color:var(--v-muted)]">Child</span>
                </div>
              ))
            : null}
        </>
      ) : null}
    </div>
  );
}

export function LinkageTree({ variant }: { variant: "p1" | "p1p2" }) {
  const [sel, setSel] = useState<TNode | null>(null);
  const nodes = variant === "p1" ? P1_NODES : P2_NODES;
  const bands = variant === "p1" ? P1_BANDS : P2_BANDS;
  const legend = variant === "p1" ? P1_LEGEND : P2_LEGEND;
  const height = variant === "p1" ? 470 : 570;

  return (
    <div className="tree-layout">
      <div className="tree-panel">
        <div className="legend">
          {legend.map((l) => (
            <div key={l.t} className="leg-i">
              <span className="leg-d" style={{ background: l.c, border: l.border ? `1.5px solid ${l.border}` : undefined }} />
              {l.t}
            </div>
          ))}
        </div>
        {variant === "p1p2" ? (
          <div className="mb-2 text-[11px] italic text-[color:rgba(32,74,244,0.6)]">- - promoted to Phase 2</div>
        ) : null}
        <TreeSvg nodes={nodes} bands={bands} height={height} onSelect={setSel} selectedKey={sel?.key ?? null} />
      </div>
      <div className="det-panel">
        <div className="sh">Experiment detail</div>
        <Detail n={sel} />
      </div>
    </div>
  );
}
