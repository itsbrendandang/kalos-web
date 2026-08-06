// Pure engine-response -> LineageGraph builder for the Map tab's Lineage lens.
// No React, no fetch, no DOM: it takes exactly what `GET /api/campaign`
// returns and produces the node/edge/stub set the canvas renders, so it is
// unit-testable end to end (__tests__/map-lineage.test.ts) and the same code
// path serves real and demo data (lib/workspace/graph/lineage-mock.ts builds
// an ENGINE-SHAPED payload, not a pre-built graph).
//
// LINEAGE HONESTY - the load-bearing rule in this module.
// The engine reports two different numbers for where a run came from:
//   * `parent_ids`      - the base rows it can NAME (rows folded from a
//                         prior measured run, which kept their run id).
//   * `parent_row_count`- the TRUE total number of base rows the GP
//                         conditioned on, including every row from the
//                         original CSV upload, which never had a per-row id
//                         and is therefore genuinely untraceable.
// `parent_row_count` is nearly always larger. This module NEVER closes that
// gap. It emits one edge per named ancestor and not one edge more, and it
// records the shortfall as an `UntraceableStub` - a counted, node-less
// decoration - so the canvas can show that the unnamed rows exist without
// inventing ids, positions, or edges for them. Overstating provenance in a
// graph that ships to pharma is worse than drawing no graph at all.
import type { Campaign as EngineCampaign, CampaignRun as EngineRun } from "@/lib/api";
import type { LineageGraph, MapEdge, MapNode, UntraceableStub } from "../map-types";

/** Exactly the engine's active-campaign response - the builder's only input
 *  shape, so demo data has to be engine-shaped to reach the canvas. */
export type LineageSource = Extract<EngineCampaign, { has_campaign: true }>;

export type BuildLineageOptions = {
  /** The engine's conformal band (`conformal_q` from `GET /api/latest`), used
   *  as the "within noise" threshold for run-to-run neighbour edges. Null
   *  when the analysis has not run or does not report one - in which case no
   *  neighbour edges are drawn and the inspector says so, rather than
   *  falling back to an invented epsilon. */
  noiseBand: number | null;
};

const SECONDS_TO_MS = 1000;

function toMs(seconds: number | null | undefined): number | null {
  return seconds == null ? null : seconds * SECONDS_TO_MS;
}

/** Runs are identified by uuid hex in the engine; a full uuid is unreadable
 *  as a canvas label. The node's `id` always keeps the full value (and the
 *  inspector prints it in full) - this is display shorthand only. */
function runLabel(id: string): string {
  return `Run ${id.length > 6 ? id.slice(0, 6) : id}`;
}

const hubId = (round: number) => `round-${round}`;
const runNodeId = (id: string) => `run-${id}`;

type RoundPoint = { round: number; best: number | null; n_base: number };

/** Folded rows carry no round of their own - the engine records only WHEN a
 *  row was folded, not which round produced it. `history` does carry `n_base`
 *  per round, and a fold is exactly what appends a history point, so the rows
 *  added between two history points are a real, engine-reported delta:
 *  `n_base[i] - n_base[i-1]`.
 *
 *  Note the off-by-one that matters: those rows were MEASURED during round
 *  `history[i-1].round` and folded at the transition into `history[i].round`,
 *  so they are attributed to the earlier round - the one whose work they
 *  actually are. Folded rows arrive in fold order, so handing out that many
 *  rows per round in order is a derivation from two engine facts, not a guess.
 *
 *  What this deliberately does NOT do: pad a round whose delta exceeds the
 *  named rows available. Round 0's `n_base` is the original upload, whose
 *  rows have no ids at all, and any later shortfall is real untraceable
 *  provenance too. Both are returned in `untraceableByRound` and become
 *  counted stubs - never fabricated nodes, never edges. */
export function attributeFoldedRows<T>(
  rows: readonly T[],
  history: readonly RoundPoint[],
): { byRound: Map<number, T[]>; untraceableByRound: Map<number, number> } {
  const byRound = new Map<number, T[]>();
  const untraceableByRound = new Map<number, number>();
  for (const p of history) {
    byRound.set(p.round, []);
    untraceableByRound.set(p.round, 0);
  }
  if (history.length === 0) return { byRound, untraceableByRound };

  // The seeded base. Every one of these rows came from the original upload
  // and has no per-row id: untraceable by construction, not by omission.
  untraceableByRound.set(history[0].round, Math.max(0, history[0].n_base));

  let cursor = 0;
  for (let i = 1; i < history.length; i++) {
    const delta = Math.max(0, history[i].n_base - history[i - 1].n_base);
    const owner = history[i - 1].round;
    const taken = rows.slice(cursor, cursor + delta);
    cursor += taken.length;
    byRound.set(owner, [...(byRound.get(owner) ?? []), ...taken]);
    untraceableByRound.set(owner, (untraceableByRound.get(owner) ?? 0) + (delta - taken.length));
  }

  // Rows the history deltas do not account for are still real named rows -
  // attach them to the most recent round that could have produced a fold
  // rather than dropping them, which would understate what is traceable.
  if (cursor < rows.length) {
    const owner = (history.length >= 2 ? history[history.length - 2] : history[0]).round;
    byRound.set(owner, [...(byRound.get(owner) ?? []), ...rows.slice(cursor)]);
  }

  return { byRound, untraceableByRound };
}

function hubSublabel(args: {
  index: number;
  uploadedRows: number;
  foldedCount: number;
  untraceable: number;
  proposalCount: number;
  isOpen: boolean;
}): string {
  const { index, uploadedRows, foldedCount, untraceable, proposalCount, isOpen } = args;
  if (isOpen) {
    if (proposalCount > 0) return `${proposalCount} proposal${proposalCount === 1 ? "" : "s"}`;
    return `${foldedCount} run${foldedCount === 1 ? "" : "s"}`;
  }
  if (index === 0) {
    const uploaded = `${uploadedRows} row${uploadedRows === 1 ? "" : "s"} uploaded`;
    return foldedCount > 0 ? `${uploaded} · ${foldedCount} run${foldedCount === 1 ? "" : "s"}` : uploaded;
  }
  const total = foldedCount + untraceable;
  // A closed round whose work has not been folded yet reads as "0 runs
  // folded", which sounds like the round did nothing. It did not fold
  // anything YET - a different claim, and the true one.
  if (total === 0) return "nothing folded yet";
  return `${total} run${total === 1 ? "" : "s"} folded`;
}

export function buildLineageGraph(c: LineageSource, opts: BuildLineageOptions): LineageGraph {
  const history: RoundPoint[] = [...c.history].sort((a, b) => a.round - b.round);
  const foldedRows = [...(c.lineage?.folded_rows ?? [])].sort(
    (a, b) => (a.measured_at ?? a.created_at) - (b.measured_at ?? b.created_at),
  );
  const { byRound, untraceableByRound } = attributeFoldedRows(foldedRows, history);

  const awaiting = c.pending.filter((r) => r.awaiting);
  const measuredUnfolded = c.pending.filter((r) => !r.awaiting);

  // The open round's hub value: the best MEASURED value known right now.
  // `history.best` is only as fresh as the last fold, so a measured-but-not-
  // yet-folded run that beat it is folded in here. Both inputs are real
  // measurements; neither is a prediction.
  const openHistoryBest = history.find((p) => p.round === c.round)?.best ?? null;
  const bestUnfolded = measuredUnfolded.reduce<number | null>(
    (acc, r) => (r.result == null ? acc : acc == null || r.result > acc ? r.result : acc),
    null,
  );
  const openBest =
    openHistoryBest == null ? bestUnfolded : bestUnfolded == null ? openHistoryBest : Math.max(openHistoryBest, bestUnfolded);

  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const stubs: UntraceableStub[] = [];

  // --- Round hubs + spine -------------------------------------------------
  history.forEach((point, i) => {
    const isOpen = point.round === c.round;
    const folded = byRound.get(point.round) ?? [];
    const untraceable = untraceableByRound.get(point.round) ?? 0;
    nodes.push({
      id: hubId(point.round),
      kind: isOpen ? "round-hub-open" : "round-hub",
      round: point.round,
      label: `ROUND ${point.round}`,
      sublabel: hubSublabel({
        index: i,
        uploadedRows: history[0].n_base,
        foldedCount: folded.length,
        untraceable,
        proposalCount: awaiting.length,
        isOpen,
      }),
      value: isOpen ? openBest : point.best,
      band: null,
      recipe: null,
      mode: null,
      createdAtMs: null,
      measuredAtMs: null,
      provenance: { traceableIds: folded.map((r) => runNodeId(r.run_id)), totalCount: folded.length + untraceable },
      x: 0,
      y: 0,
      fixed: true,
    });
    if (untraceable > 0) {
      stubs.push({ id: `stub-${hubId(point.round)}`, nodeId: hubId(point.round), count: untraceable });
    }
    if (i > 0) {
      edges.push({
        id: `spine-${history[i - 1].round}-${point.round}`,
        kind: "round-spine",
        source: hubId(history[i - 1].round),
        target: hubId(point.round),
      });
    }
  });

  const roundNumbers = new Set(history.map((p) => p.round));

  function attachToHub(nodeId: string, round: number) {
    if (!roundNumbers.has(round)) return;
    edges.push({ id: `hub-${round}-${nodeId}`, kind: "hub-to-run", source: hubId(round), target: nodeId });
  }

  // --- Folded (already-in-the-base-data) runs ------------------------------
  // These kept their run id through the fold, so they can be named - but the
  // fold discards the recipe/target association back to the run, so their
  // value and recipe are genuinely unknown here. Null, not zero, not guessed.
  for (const [round, rows] of byRound) {
    for (const row of rows) {
      const id = runNodeId(row.run_id);
      nodes.push({
        id,
        kind: "measured-run",
        round,
        label: runLabel(row.run_id),
        sublabel: null,
        value: null,
        band: null,
        recipe: null,
        mode: null,
        createdAtMs: toMs(row.created_at),
        measuredAtMs: toMs(row.measured_at),
        provenance: null,
        x: 0,
        y: 0,
        fixed: false,
      });
      attachToHub(id, round);
    }
  }

  // --- Pending runs (measured-not-yet-folded, and awaiting proposals) ------
  // Both were started in the current round: a fold is what advances the round
  // counter, so anything still in `pending` belongs to the open round.
  const bestUnfoldedId = (() => {
    let bestId: string | null = null;
    let bestValue: number | null = null;
    for (const r of measuredUnfolded) {
      if (r.result == null) continue;
      if (bestValue == null || r.result > bestValue) {
        bestValue = r.result;
        bestId = r.id;
      }
    }
    return bestId;
  })();

  function provenanceOf(r: EngineRun): MapNode["provenance"] {
    if (r.parent_ids == null && r.parent_row_count == null) return null;
    return {
      traceableIds: (r.parent_ids ?? []).map(runNodeId),
      totalCount: r.parent_row_count ?? null,
    };
  }

  function pushPendingRun(r: EngineRun, kind: MapNode["kind"]) {
    const id = runNodeId(r.id);
    const provenance = provenanceOf(r);
    nodes.push({
      id,
      kind,
      round: c.round,
      label: runLabel(r.id),
      sublabel: r.reason || null,
      value: kind === "proposal" ? r.pred : r.result,
      band: kind === "proposal" ? r.std : null,
      recipe: r.recipe,
      mode: r.mode,
      createdAtMs: toMs(r.created_at),
      measuredAtMs: toMs(r.measured_at),
      provenance,
      x: 0,
      y: 0,
      fixed: false,
    });
    attachToHub(id, c.round);
  }

  for (const r of measuredUnfolded) {
    pushPendingRun(r, r.id === bestUnfoldedId ? "round-best" : "measured-run");
  }
  for (const r of awaiting) {
    pushPendingRun(r, "proposal");
  }

  // --- Descent edges: exactly one per NAMED ancestor ----------------------
  //
  // With one LOSSLESS aggregation. kalos's `parent_ids` is "every base row
  // the fit could name", so a proposal typically names *all* of a round's
  // traceable rows. When a node's named ancestors in round r are exactly all
  // of round r's nameable nodes, the per-ancestor edges and a single edge
  // from round r's hub carry identical information - "it descends from round
  // r, entirely" - so the hub edge replaces them. This is not a simplifying
  // cap: any node naming a strict SUBSET of a round still gets one edge per
  // named ancestor, because there the individual identities are the
  // information. A future engine that reports selective parents therefore
  // starts drawing per-run descent with no change here.
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const isNameable = (n: MapNode) => n.kind !== "round-hub" && n.kind !== "round-hub-open";
  const nameableByRound = new Map<number, number>();
  for (const n of nodes) {
    if (isNameable(n)) nameableByRound.set(n.round, (nameableByRound.get(n.round) ?? 0) + 1);
  }

  for (const node of nodes) {
    const p = node.provenance;
    if (!p || !isNameable(node)) continue;
    const resolved = p.traceableIds.filter((pid) => nodeById.has(pid) && pid !== node.id);

    const byAncestorRound = new Map<number, string[]>();
    for (const pid of resolved) {
      const r = nodeById.get(pid)!.round;
      const list = byAncestorRound.get(r);
      if (list) list.push(pid);
      else byAncestorRound.set(r, [pid]);
    }

    for (const [ancestorRound, ids] of byAncestorRound) {
      const whole = ids.length > 1 && ids.length === (nameableByRound.get(ancestorRound) ?? 0);
      if (whole && roundNumbers.has(ancestorRound)) {
        edges.push({
          id: `descent-${hubId(ancestorRound)}-${node.id}`,
          kind: "cross-round-descent",
          source: hubId(ancestorRound),
          target: node.id,
        });
        continue;
      }
      for (const pid of ids) {
        edges.push({ id: `descent-${pid}-${node.id}`, kind: "cross-round-descent", source: pid, target: node.id });
      }
    }

    // The shortfall between what the engine can NAME and the true total it
    // reports. Never an edge, never a node - a counted stub the canvas draws
    // as a short line into empty space, so the unnamed rows are visibly
    // present without being individually invented.
    const unnamed = p.totalCount == null ? 0 : Math.max(0, p.totalCount - resolved.length);
    if (unnamed > 0) stubs.push({ id: `stub-${node.id}`, nodeId: node.id, count: unnamed });
  }

  // --- Run-to-run neighbour edges -----------------------------------------
  // "Within noise" is the engine's own conformal band (`conformal_q`), the
  // closest real quantity it exposes to measurement resolution. No band means
  // no edges - not a default epsilon.
  if (opts.noiseBand != null && opts.noiseBand > 0) {
    const valued = nodes.filter((n) => n.value != null && (n.kind === "measured-run" || n.kind === "round-best"));
    for (let i = 0; i < valued.length; i++) {
      for (let j = i + 1; j < valued.length; j++) {
        const a = valued[i];
        const b = valued[j];
        if (a.round !== b.round) continue;
        if (Math.abs((a.value as number) - (b.value as number)) > opts.noiseBand) continue;
        edges.push({ id: `neighbour-${a.id}-${b.id}`, kind: "run-neighbour", source: a.id, target: b.id });
      }
    }
  }

  return {
    nodes,
    edges,
    stubs,
    // Base rows plus runs that have been STARTED and measured but not yet
    // folded. Deliberately excludes `awaiting` proposals: a recipe nobody has
    // run is not a run, and counting it as one would overstate the campaign's
    // evidence in the one number a reader takes at face value.
    runCount: c.n_base + measuredUnfolded.length,
    roundCount: history.length,
    instrumented: {
      perRunLineage: foldedRows.length > 0 || c.pending.some((r) => r.parent_ids != null),
      // kalos has no SOP concept at all (ENGINE_RECON.md section 3). The
      // node kind exists in the vocabulary and the renderer handles it; it is
      // never emitted, because there is nothing real to emit.
      sop: false,
    },
  };
}

/** The replay footer's ticks, one per round, dated by REAL engine timestamps.
 *  A closed round is dated by the last result folded into it (when the round
 *  actually finished); the open round has no close date and stays null, which
 *  is what puts it in the footer's trailing band.
 *
 *  Rounds the engine cannot date at all AND that precede the first datable
 *  round are dropped rather than misplaced: round 0 is the original upload,
 *  whose rows carry no timestamp anywhere in the engine. The caller reports
 *  the drop (see ReplayFooter's coverage note) instead of silently showing a
 *  short track. */
export function lineageTicks(graph: LineageGraph, openRound: number): { id: string; dateMs: number | null; round: number }[] {
  const byRound = new Map<number, number[]>();
  for (const n of graph.nodes) {
    if (n.measuredAtMs == null) continue;
    const list = byRound.get(n.round);
    if (list) list.push(n.measuredAtMs);
    else byRound.set(n.round, [n.measuredAtMs]);
  }

  const hubs = graph.nodes
    .filter((n) => n.kind === "round-hub" || n.kind === "round-hub-open")
    .sort((a, b) => a.round - b.round);

  const all = hubs.map((h) => {
    const stamps = h.round === openRound ? [] : (byRound.get(h.round) ?? []);
    return { id: h.id, round: h.round, dateMs: stamps.length > 0 ? Math.max(...stamps) : null };
  });

  const firstDated = all.findIndex((t) => t.dateMs != null);
  return firstDated < 0 ? [] : all.slice(firstDated);
}
