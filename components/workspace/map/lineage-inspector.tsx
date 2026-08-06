"use client";

// The Map inspector (DESIGN_SPEC.md section 3.3). 292px, left hairline,
// hairline-separated sections, actions pinned to the bottom with margin-top:auto.
//
// The Connections section is where the lineage-honesty rule surfaces as
// words: it reports the TRUE total the engine says a node descends from and,
// separately, how many of those rows can actually be named. Those are two
// different numbers and this panel never collapses them into one.
import { countNeighbours, countProposalsBelow, neighbourhoodNarrative, provenanceOf } from "@/lib/workspace/graph/narrative";
import type { LineageGraph, MapNode } from "@/lib/workspace/map-types";

const DAY_MS = 86_400_000;

function humanize(key: string): string {
  return key.replace(/_/g, " ").trim();
}

function formatNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(2).replace(/\.?0+$/, "");
  return v.toFixed(3).replace(/\.?0+$/, "");
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-[9px] border-t border-border pt-4">{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">{children}</div>;
}

function Row({ label, value, trailing }: { label: string; value: string; trailing?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11.5px]">
      <span className="text-muted">{label}</span>
      <span className="tabular text-right font-plex-mono text-fg">
        {value}
        {trailing && <span className="text-muted"> {trailing}</span>}
      </span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <aside className="box-border flex w-[292px] shrink-0 flex-col gap-[18px] overflow-y-auto border-l border-border bg-card px-5 py-[22px]">
      {children}
    </aside>
  );
}

export function LineageInspector({
  graph,
  node,
  noiseBand,
  target,
}: {
  graph: LineageGraph;
  node: MapNode | null;
  noiseBand: number | null;
  target: string;
}) {
  if (!node) {
    return (
      <Shell>
        <div>
          <SectionLabel>Selected node</SectionLabel>
          <div className="mt-[5px] text-[15px] font-bold tracking-[-0.01em] text-fg">Nothing selected</div>
          <p className="mt-0.5 text-[11.5px] leading-[1.5] text-muted">
            Click a run, a proposal, or a round hub on the canvas to read its recipe and where it came from.
          </p>
        </div>
      </Shell>
    );
  }

  const isHub = node.kind === "round-hub" || node.kind === "round-hub-open";
  const prov = provenanceOf(graph, node);
  const unnamed = prov?.total != null ? Math.max(0, prov.total - prov.named) : null;
  const narrative = neighbourhoodNarrative(graph, node, noiseBand);
  const proposalsBelow = countProposalsBelow(graph, node.id);
  const neighbours = countNeighbours(graph, node.id);

  const turnaroundDays =
    node.createdAtMs != null && node.measuredAtMs != null ? Math.round((node.measuredAtMs - node.createdAtMs) / DAY_MS) : null;

  const identitySub = [
    isHub ? (node.kind === "round-hub-open" ? "Open round" : "Closed round") : `Round ${node.round}`,
    turnaroundDays != null ? `read out ${turnaroundDays} day${turnaroundDays === 1 ? "" : "s"} after booking` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const recipeRows = node.recipe ? Object.entries(node.recipe) : [];
  const isPrediction = node.kind === "proposal";

  return (
    <Shell>
      <div>
        <SectionLabel>Selected node</SectionLabel>
        <div className="mt-[5px] text-[15px] font-bold tracking-[-0.01em] text-fg">{node.label}</div>
        <div className="mt-0.5 text-[11.5px] text-muted">{identitySub}</div>
        {!isHub && (
          <div className="mt-1 break-all font-plex-mono text-[10px] text-muted">{node.id.replace(/^run-/, "")}</div>
        )}
      </div>

      <Section>
        {recipeRows.length > 0 ? (
          recipeRows.map(([key, value]) => <Row key={key} label={humanize(key)} value={formatNumber(value)} />)
        ) : (
          <p className="text-[11px] leading-[1.5] text-muted">
            {isHub
              ? "A round has no recipe of its own."
              : "The recipe is not retained once a run is folded into the base data, so the engine cannot report it for this run."}
          </p>
        )}
        {node.value != null && (
          <Row
            label={isPrediction ? `predicted ${humanize(target)}` : humanize(target)}
            value={formatNumber(node.value)}
            trailing={node.band != null ? `± ${formatNumber(node.band)}` : undefined}
          />
        )}
      </Section>

      <Section>
        <SectionLabel>Connections</SectionLabel>
        {prov == null ? (
          <p className="text-[11px] leading-[1.5] text-muted">
            The engine reports no ancestry for this node, so nothing is claimed about where it came from.
          </p>
        ) : (
          <>
            <Row
              label="descends from"
              value={prov.total != null ? `${prov.total} row${prov.total === 1 ? "" : "s"}` : `${prov.named} named`}
            />
            <Row label="of those, named" value={`${prov.named}`} />
            {unnamed != null && unnamed > 0 && (
              <p className="text-[11px] leading-[1.5] text-muted">
                {unnamed} came from the original upload with no per-row id. They are real ancestors and they are not drawn,
                because there is nothing to draw them to.
              </p>
            )}
          </>
        )}
        <Row label="proposals below it" value={`${proposalsBelow}`} />
        {noiseBand != null ? (
          <Row label="neighbours within noise" value={`${neighbours}`} />
        ) : (
          <p className="text-[11px] leading-[1.5] text-muted">
            Neighbours within noise need the analysis&rsquo;s conformal band, which the engine has not reported for this
            campaign.
          </p>
        )}
        <p className="text-[11px] leading-[1.5] text-muted">
          Governed by: kalos has no SOP or governance concept, so nothing governs this run yet.
        </p>
      </Section>

      {narrative && (
        <div className="border-t border-border pt-4">
          <p className="font-serif text-[14px] leading-[1.55] text-muted [text-wrap:pretty]">{narrative}</p>
        </div>
      )}

      {/* Both of the design's inspector actions were shipping as live-looking
          buttons with no onClick. Tracing forward needs the descendant side
          of lineage, which the engine discards when it folds a run; asking
          why needs an assistant, which does not exist (the Ask panel's own
          composer is disabled for the same reason). They stay in place,
          visibly disabled and carrying their reason, rather than looking
          live and silently doing nothing. */}
      <div className="mt-auto flex flex-col gap-[7px] pt-4">
        <button
          type="button"
          disabled
          title="Tracing forward needs the descendant side of lineage, which the engine discards when it folds a run."
          className="cursor-not-allowed rounded-[10px] bg-action px-3 py-[9px] text-[12px] font-semibold text-white opacity-55"
        >
          Trace this lineage forward
        </button>
        <button
          type="button"
          disabled
          title="Ask has no assistant behind it yet, so it cannot answer why this run was chosen."
          className="cursor-not-allowed rounded-[10px] border border-border px-3 py-[9px] text-[12px] font-semibold text-fg opacity-55"
        >
          Ask why it was chosen
        </button>
      </div>
    </Shell>
  );
}
