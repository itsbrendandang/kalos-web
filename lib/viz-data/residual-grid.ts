/*
 * H6 residuals by round (VIZ_SPEC_V2 4.H6). Pure: campaign runs -> a round x
 * proposal-slot grid of "measured minus the prediction the engine recorded when
 * the run started", in units of that run's band half-width.
 *
 * Every number is an engine field: `pending[].round`,
 * `prediction_at_start.{pred, interval.half_width, coverage, proposal_index}`,
 * `residual` and `inside_band` (taken verbatim, never re-derived). The only
 * arithmetic is residual / half_width for the fill class.
 *
 * Engine gap E1: when a round is folded into the model (re-analysis), its runs
 * leave `pending` and keep no recorded prediction, so earlier rounds read
 * "needs prediction history" and never a guessed residual.
 */
import type { DataTable } from "@/components/viz/frame";
import type { Campaign, CampaignRun } from "@/lib/api";
import { displayRound } from "@/lib/campaign-stage";
import { coverageText, formatValue } from "@/lib/num";
import { shortId } from "@/lib/workbench";

export const NEEDS_HISTORY =
  "Needs prediction history: when a round is folded into the model, the engine keeps no record of what it predicted for those runs (engine field folded_runs[].prediction_at_start does not exist yet).";

export type ResidualCell = {
  runId: string;
  slot: string;
  state: "residual" | "awaiting" | "no-prediction" | "no-band";
  measured: number | null;
  pred: number | null;
  residual: number | null;
  halfWidth: number | null;
  lo: number | null;
  hi: number | null;
  coverage: number | null;
  /** residual / half_width, or null. */
  ratio: number | null;
  /** -2..2: outside low, inside low, centre, inside high, outside high; null without a ratio. */
  cls: number | null;
  /** The engine's `inside_band`, verbatim. */
  inside: boolean | null;
  reason: string | null;
};

export type ResidualRound = {
  round: number;
  label: string;
  cells: ResidualCell[];
  /** Folded round: no run of it keeps a recorded prediction. */
  needsHistory: boolean;
  inside: number;
  judged: number;
  awaiting: number;
};

export type ResidualGrid = {
  rounds: ResidualRound[];
  columns: string[];
  coverage: number | null;
  unit: string | null;
  /** True when at least one run has a residual against a recorded prediction. */
  hasResidual: boolean;
};

type Active = Extract<Campaign, { has_campaign: true }>;

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Diverging class of a residual in band half-widths (symmetric around 0). */
export function ratioClass(r: number | null): number | null {
  if (r == null || !Number.isFinite(r)) return null;
  const a = Math.abs(r);
  const k = a <= 1 / 3 ? 0 : a <= 1 ? 1 : 2;
  return r < 0 && k > 0 ? -k : k;
}

function cellOf(run: CampaignRun): ResidualCell {
  const at = run.prediction_at_start;
  const recorded = at && at.available ? at : null;
  const idx = recorded && fin(recorded.proposal_index) ? recorded.proposal_index : null;
  const base: ResidualCell = {
    runId: run.id,
    slot: idx != null ? `P${idx + 1}` : "not proposed",
    state: "no-prediction",
    measured: fin(run.result) ? run.result : null,
    pred: recorded && fin(recorded.pred) ? recorded.pred : null,
    residual: null,
    halfWidth: null,
    lo: null,
    hi: null,
    coverage: null,
    ratio: null,
    cls: null,
    inside: null,
    reason: null,
  };
  if (!recorded) {
    return {
      ...base,
      reason:
        at && at.available === false
          ? at.reason
          : run.pred_source === "caller"
            ? "the prediction for this run came from you, not the engine"
            : "this run was started before the engine recorded predictions",
    };
  }
  const i = recorded.interval;
  const hw = i && fin(i.half_width) ? i.half_width : i && fin(i.lo) && fin(i.hi) ? (i.hi - i.lo) / 2 : null;
  const withBand = { ...base, halfWidth: hw, lo: i && fin(i.lo) ? i.lo : null, hi: i && fin(i.hi) ? i.hi : null, coverage: i && fin(i.coverage) ? i.coverage : null };
  if (run.awaiting || run.result == null) return { ...withBand, state: "awaiting" };
  const residual = fin(run.residual) ? run.residual : null;
  if (hw == null || hw <= 0) return { ...withBand, state: "no-band", residual, inside: run.inside_band ?? null, reason: recorded.interval_unavailable_reason ?? "no band was recorded with this prediction" };
  const ratio = residual != null ? residual / hw : null;
  return { ...withBand, state: "residual", residual, ratio, cls: ratioClass(ratio), inside: run.inside_band ?? null };
}

export function toResidualGrid(c: Active | null | undefined, unit: string | null = null): ResidualGrid | null {
  if (!c) return null;
  const byRound = new Map<number, CampaignRun[]>();
  for (const r of c.pending ?? []) {
    if (!fin(r.round)) continue;
    byRound.set(r.round, [...(byRound.get(r.round) ?? []), r]);
  }
  const current = fin(c.round) ? c.round : 0;
  const top = Math.max(current, ...byRound.keys());
  const rounds: ResidualRound[] = [];
  const columns: string[] = [];
  const covs = new Set<number>();
  for (let r = top; r >= 0; r--) {
    const runs = byRound.get(r);
    if (!runs?.length) {
      // A round before the current one had runs that were folded: their predictions are gone (E1).
      if (r < current) rounds.push({ round: r, label: `Round ${displayRound(r)}`, cells: [], needsHistory: true, inside: 0, judged: 0, awaiting: 0 });
      continue;
    }
    const cells = runs.map(cellOf).sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot) || 0);
    // Two runs on one slot (a replicate) get their own column, "P1 #2".
    const seen = new Map<string, number>();
    for (const cell of cells) {
      const k = (seen.get(cell.slot) ?? 0) + 1;
      seen.set(cell.slot, k);
      if (k > 1) cell.slot = `${cell.slot} #${k}`;
      if (!columns.includes(cell.slot)) columns.push(cell.slot);
      if (cell.coverage != null) covs.add(cell.coverage);
    }
    rounds.push({
      round: r,
      label: `Round ${displayRound(r)}`,
      cells,
      needsHistory: false,
      inside: cells.filter((x) => x.inside === true).length,
      judged: cells.filter((x) => x.inside != null).length,
      awaiting: cells.filter((x) => x.state === "awaiting").length,
    });
  }
  columns.sort((a, b) => slotOrder(a) - slotOrder(b));
  return {
    rounds,
    columns,
    coverage: covs.size === 1 ? [...covs][0] : null,
    unit,
    hasResidual: rounds.some((r) => r.cells.some((x) => x.state === "residual")),
  };
}

function slotOrder(slot: string): number {
  const m = /^P(\d+)(?: #(\d+))?$/.exec(slot);
  if (!m) return 10_000;
  return Number(m[1]) * 100 + (m[2] ? Number(m[2]) : 0);
}

/** The signed residual as printed: "+0.42" / "−0.31", at the precision the band supports. */
export function residualText(c: ResidualCell): string {
  if (c.residual == null) return "n/a";
  return formatValue(c.residual, { sign: true, uncertainty: c.halfWidth ?? undefined }).value;
}

export function ratioText(r: number | null): string {
  return r == null ? "n/a" : `${formatValue(r, { quantity: "score", sign: true }).value}×`;
}

export function describeResidualGrid(g: ResidualGrid): string {
  const cov = coverageText(g.coverage);
  const parts = g.rounds.map((r) =>
    r.needsHistory
      ? `${r.label}: needs prediction history`
      : `${r.label}: ${r.inside} of ${r.judged} inside the ${cov ? `${cov} ` : ""}band recorded at start${r.awaiting ? `, ${r.awaiting} awaiting` : ""}`,
  );
  return `Measured minus the prediction recorded when each run started, in band half-widths, by round. ${parts.join(". ")}.`;
}

export function residualTable(g: ResidualGrid): DataTable {
  return {
    caption: "Per run: the prediction recorded at start, the measured result and the residual, as the engine stored them",
    columns: ["Round", "Slot", "Run", "Predicted at start", "Band", "Measured", "Measured − predicted", "In half-widths", "Inside band (engine)"],
    rows: g.rounds.flatMap((r) =>
      r.needsHistory
        ? [[r.label, "n/a", "n/a", "n/a", "n/a", "n/a", "needs prediction history", "n/a", "n/a"]]
        : r.cells.map((c) => [
            r.label,
            c.slot,
            shortId(c.runId),
            c.pred != null ? formatValue(c.pred).value : "n/a",
            c.lo != null && c.hi != null ? `[${formatValue(c.lo).value}, ${formatValue(c.hi).value}]` : "n/a",
            c.measured != null ? formatValue(c.measured).value : c.state === "awaiting" ? "Awaiting result" : "n/a",
            residualText(c),
            ratioText(c.ratio),
            c.inside == null ? "n/a" : c.inside ? "inside" : "outside",
          ]),
    ),
  };
}
