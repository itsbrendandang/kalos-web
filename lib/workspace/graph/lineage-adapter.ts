// The Map tab's data seam - a second, NARROWER seam alongside
// lib/workspace/adapter.ts, not a replacement for it.
//
// Why two seams: adapter.ts maps the engine onto lib/workspace/types.ts, the
// generic Campaign/Round/Run shapes the Log tab renders. Those types
// deliberately carry no timestamps and no ancestry, because most of the
// workspace has no use for either. The Lineage lens needs exactly those two
// things (real `created_at`/`measured_at` for the replay footer's date-spaced
// ticks, and `parent_ids`/`parent_row_count` for the traceable-vs-total
// honesty rule), so it reads the engine response directly and hands it to the
// pure builder in ./build-lineage.ts. Everything under
// components/workspace/map/** calls through here; none of it imports
// lib/api.ts.
import { getCampaign as fetchEngineCampaign, getLatest as fetchEngineLatest } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";
import { buildLineageGraph, type LineageSource } from "./build-lineage";
import { MOCK_LINEAGE_CAMPAIGN, MOCK_NOISE_BAND } from "./lineage-mock";
import type { LineageGraph } from "../map-types";

export type LineageResult =
  | { status: "unavailable" }
  | {
      status: "ok";
      graph: LineageGraph;
      /** The engine's open round - the replay footer needs it to know which
       *  tick has no close date yet. */
      openRound: number;
      target: string;
      /** The conformal band that defined "within noise" for this graph's
       *  neighbour edges, or null when the analysis reports none. The
       *  inspector prints the honest absence rather than a zero. */
      noiseBand: number | null;
      demo: boolean;
    };

/** `GET /api/latest`'s conformal band, or null. A failed/absent analysis is
 *  NOT fatal to the Map tab - the graph still draws, it just draws no
 *  "within noise" neighbour edges, and the inspector says why. */
async function fetchNoiseBand(): Promise<number | null> {
  try {
    const latest = await fetchEngineLatest();
    return latest.has_data ? (latest.conformal_q ?? null) : null;
  } catch {
    return null;
  }
}

export async function getLineageGraph(campaignId: string): Promise<LineageResult> {
  let engine;
  try {
    engine = await fetchEngineCampaign();
  } catch {
    return { status: "unavailable" };
  }

  if (engine.has_campaign) {
    const noiseBand = await fetchNoiseBand();
    const source: LineageSource = engine;
    return {
      status: "ok",
      graph: buildLineageGraph(source, { noiseBand }),
      openRound: source.round,
      target: source.target,
      noiseBand,
      demo: false,
    };
  }

  // Real data always wins above; demo only ever fills a genuine gap, and only
  // with the flag on. Note it runs through the SAME builder - see
  // ./lineage-mock.ts for why the mock is engine-shaped.
  if (DEMO_MODE) {
    return {
      status: "ok",
      graph: buildLineageGraph(MOCK_LINEAGE_CAMPAIGN, { noiseBand: MOCK_NOISE_BAND }),
      openRound: MOCK_LINEAGE_CAMPAIGN.round,
      target: MOCK_LINEAGE_CAMPAIGN.target,
      noiseBand: MOCK_NOISE_BAND,
      demo: true,
    };
  }

  // No live campaign, demo off: an honestly empty graph, not a fabricated
  // one. The canvas renders its own empty state from `nodes.length === 0`.
  void campaignId;
  return {
    status: "ok",
    graph: { nodes: [], edges: [], stubs: [], runCount: 0, roundCount: 0, instrumented: { perRunLineage: false, sop: false } },
    openRound: 0,
    target: "",
    noiseBand: null,
    demo: false,
  };
}
