"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Network } from "lucide-react";
import { PageHeader } from "@/components/kit/page-header";
import { Panel } from "@/components/kit/section";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useLatest } from "@/hooks/use-engine";
import { buildGraph, GRAPH_H, GRAPH_W, inputSentence, type Graph, type GraphNode } from "@/lib/graph";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Graph: the campaign as a map. The result sits in the middle, the process
 * inputs ring it (bigger = matters more, thicker line = stronger link, solid =
 * statistically solid), and each proposed recipe links to the inputs it
 * changes. It restates the engine's analysis; it does not add anything to it.
 */
export default function GraphPage() {
  const latest = useLatest();
  const analysis = latest.data?.has_data ? latest.data : null;
  const graph = useMemo(() => (analysis ? buildGraph(analysis) : null), [analysis]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="How it all connects" description="Your result in the middle, the inputs around it, and the recipes the model suggests on the outside. Tap anything to see why." />
      {latest.status === "error" ? (
        <ErrorState title="Could not reach the engine" description="This is a connection problem, not an empty graph." onRetry={() => void latest.refresh()} busy={latest.refreshing} />
      ) : !latest.data ? (
        <LoadingSkeleton variant="chart" label="Loading the graph" />
      ) : !graph ? (
        <EmptyState icon={Network} title="Nothing to connect yet" description="Upload a run sheet in Setup and the map builds itself." action={<Link href="/campaign/setup" className={buttonVariants({})}>Go to Setup <ArrowRight /></Link>} />
      ) : (
        <GraphView graph={graph} target={analysis!.target} />
      )}
    </div>
  );
}

function GraphView({ graph, target }: { graph: Graph; target: string }) {
  const [selected, setSelected] = useState<string>("target");
  const [hover, setHover] = useState<string | null>(null);
  const focus = hover ?? selected;
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const linked = useMemo(() => {
    const s = new Set<string>([focus]);
    for (const e of graph.edges) {
      if (e.from === focus) s.add(e.to);
      if (e.to === focus) s.add(e.from);
    }
    // Selecting the target lights the inputs; selecting a recipe lights its inputs and the target via them.
    return s;
  }, [graph, focus]);
  const node = byId.get(selected)!;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Panel className="p-2 sm:p-4">
        <svg viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} role="group" aria-label={`Graph of ${target}, its inputs and proposed recipes`} className="h-auto w-full">
          {graph.edges.map((e) => {
            const a = byId.get(e.from)!;
            const b = byId.get(e.to)!;
            const on = e.from === focus || e.to === focus;
            return (
              <line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeLinecap="round"
                strokeWidth={e.kind === "driver" ? 1 + e.weight * 5 : 1.25}
                strokeDasharray={e.kind === "driver" && !e.significant ? "5 6" : e.kind === "varies" ? "2 5" : e.kind === "simulates" ? "1 6" : undefined}
                className={cn("transition-[opacity,stroke] duration-200", e.kind === "driver" ? "stroke-accent" : "stroke-border-strong", on ? "opacity-100" : focus ? "opacity-15" : e.kind === "driver" ? "opacity-70" : "opacity-40")}
              />
            );
          })}
          {graph.nodes.map((n) => (
            <NodeShape key={n.id} n={n} dim={focus !== "target" && !linked.has(n.id)} selected={selected === n.id} onSelect={() => setSelected(n.id)} onHover={setHover} />
          ))}
        </svg>
        <Legend />
      </Panel>

      <aside aria-live="polite" className="h-fit rounded-2xl glass p-5 lg:sticky lg:top-6">
        <Detail node={node} target={target} />
      </aside>
    </div>
  );
}

function NodeShape({ n, dim, selected, onSelect, onHover }: { n: GraphNode; dim: boolean; selected: boolean; onSelect: () => void; onHover: (id: string | null) => void }) {
  const right = Math.cos(n.kind === "target" ? 0 : n.angle) >= 0;
  const labelDx = n.kind === "target" ? 0 : (right ? 1 : -1) * (n.r + 8);
  const fill = n.kind === "tool" ? "fill-subtle" : n.kind === "target" ? "fill-accent" : n.kind === "input" ? (n.significant ? "fill-accent" : "fill-surface") : n.mode === "exploit" ? "fill-fg" : "fill-surface";
  const stroke = n.kind === "proposal" ? "stroke-fg" : n.kind === "tool" ? "stroke-fg-muted" : "stroke-accent";
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={n.kind === "target" ? `Result: ${n.label}` : n.label}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      onMouseEnter={() => onHover(n.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(n.id)}
      onBlur={() => onHover(null)}
      className={cn("cursor-pointer outline-none transition-opacity duration-200 focus-visible:[&>circle:first-of-type]:stroke-[4]", dim ? "opacity-30" : "opacity-100")}
    >
      <circle cx={n.x} cy={n.y} r={n.r} strokeWidth={selected ? 4 : 2} className={cn(fill, stroke, "transition-all duration-200")} />
      {n.kind === "target" ? (
        <text x={n.x} y={n.y + 4} textAnchor="middle" className="fill-bg text-[15px] font-semibold">
          Result
        </text>
      ) : (
        <text x={n.x + labelDx} y={n.y + 4} textAnchor={right ? "start" : "end"} className={cn("fill-fg text-[15px]", selected && "font-semibold")} paintOrder="stroke" strokeWidth={4} stroke="var(--color-bg)" strokeLinejoin="round">
          {n.label}
        </text>
      )}
    </g>
  );
}

function Legend() {
  const item = "flex items-center gap-2";
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 px-3 pt-1 pb-2 text-caption text-fg-muted">
      <li className={item}><span className="size-3 rounded-full bg-accent" aria-hidden />Input that clearly matters</li>
      <li className={item}><span className="size-3 rounded-full border-2 border-accent bg-surface" aria-hidden />Input, not clearly</li>
      <li className={item}><span className="size-3 rounded-full bg-fg" aria-hidden />Recipe to exploit</li>
      <li className={item}><span className="size-3 rounded-full border-2 border-fg bg-surface" aria-hidden />Recipe to explore</li>
      <li className={item}><span className="size-3 rounded-[4px] border-2 border-fg-muted bg-subtle" aria-hidden />Simulation tool</li>
      <li className="w-full">Bigger input = matters more. Thicker line = stronger link. These are patterns in your runs, not proof of cause.</li>
    </ul>
  );
}

function Detail({ node, target }: { node: GraphNode; target: string }) {
  if (node.kind === "target")
    return (
      <>
        <p className="text-label text-fg-muted">Result</p>
        <h2 className="text-title text-fg break-words">{target}</h2>
        <p className="mt-2 text-body text-fg-muted">
          {node.best != null ? `Best measured so far is ${formatNumber(node.best)}, from ${formatNumber(node.n, "count")} runs. ` : ""}
          Every input around it is linked by how closely it moves with this number.
        </p>
      </>
    );
  if (node.kind === "input")
    return (
      <>
        <p className="text-label text-fg-muted">Process input</p>
        <h2 className="font-mono text-heading text-fg break-words">{node.label}</h2>
        <p className="mt-2 text-body text-fg-muted">{inputSentence(node)}</p>
      </>
    );
  if (node.kind === "tool")
    return (
      <>
        <p className="text-label text-fg-muted">Simulation tool</p>
        <h2 className="text-title text-fg">{node.label}</h2>
        <p className="mt-2 text-body text-fg-muted">{node.blurb}</p>
        <Link href={node.href} className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
          Open {node.label} <ArrowRight />
        </Link>
      </>
    );
  return (
    <>
      <p className="text-label text-fg-muted">{node.mode === "explore" ? "Recipe to explore" : "Recipe to exploit"}</p>
      <h2 className="text-title text-fg">{node.label}</h2>
      <p className="mt-1 flex items-baseline gap-1.5 text-body text-fg-muted">
        Twin expects <span className="text-heading tabular-nums text-fg">{formatNumber(node.pred)}</span>
        <span className="text-caption tabular-nums">± {formatNumber(node.std)}</span>
      </p>
      <p className="mt-2 text-body text-fg-muted">{node.reason}. It changes the inputs it is linked to.</p>
      <Link href="/campaign/plan" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
        Review in Plan <ArrowRight />
      </Link>
    </>
  );
}
