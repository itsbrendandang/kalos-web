"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useReducer, useState } from "react";
import { CircleCheck, CircleDashed, FileText, LineChart, RefreshCw } from "lucide-react";
import { DemoBadge } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EditorTabs, type EditorTab } from "@/components/workbench/editor-tabs";
import { Explorer } from "@/components/workbench/explorer";
import { BatchPanel, CampaignError, ProgressPanel, RunPanel } from "@/components/workbench/panels";
import { StatusBar } from "@/components/workbench/status-bar";
import { getCampaign, getLatest, type Campaign, type LatestResult } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import {
  campaignView,
  closeTab,
  INITIAL_TABS,
  openTab,
  pruneRunTabs,
  queueState,
  shortId,
  tabKey,
  type TabsState,
  type WorkbenchTab,
} from "@/lib/workbench";

type TabsAction =
  | { type: "open"; tab: WorkbenchTab }
  | { type: "activate"; key: string }
  | { type: "close"; key: string }
  | { type: "prune"; runIds: ReadonlySet<string> };

function tabsReducer(s: TabsState, a: TabsAction): TabsState {
  switch (a.type) {
    case "open":
      return openTab(s, a.tab);
    case "activate":
      return { ...s, active: a.key };
    case "close":
      return closeTab(s, a.key);
    case "prune":
      return pruneRunTabs(s, a.runIds);
  }
}

const TAB_ICON = "size-3.5 shrink-0";

/**
 * The Experiments hub's Live view: a VS Code-style workbench over the
 * campaign the /decide loop runs. EXPLORER lists the runs in flight, the runs
 * measured this round and the rounds so far; the editor opens the next batch,
 * the progress trajectory, or any run in tabs; the status bar summarizes the
 * campaign. Read-only by design - starting runs and logging results happen on
 * /decide, which every action here links to.
 */
export function LiveWorkbench() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignErr, setCampaignErr] = useState(false);
  const [latest, setLatest] = useState<LatestResult | null>(null);
  const [latestErr, setLatestErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tabs, dispatch] = useReducer(tabsReducer, INITIAL_TABS);
  const panelId = useId();

  // Each fetch settles on its own: a failed /api/latest never hides the
  // campaign, and a failed campaign never hides the next batch.
  const apply = useCallback((c: PromiseSettledResult<Campaign>, l: PromiseSettledResult<LatestResult>) => {
    if (c.status === "fulfilled") {
      setCampaign(c.value);
      setCampaignErr(false);
    } else {
      setCampaignErr(true);
    }
    if (l.status === "fulfilled") {
      setLatest(l.value);
      setLatestErr(false);
    } else {
      setLatestErr(true);
    }
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [c, l] = await Promise.allSettled([getCampaign(), getLatest()]);
      apply(c, l);
    } finally {
      setBusy(false);
    }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getCampaign(), getLatest()]).then(([c, l]) => {
      if (!cancelled) apply(c, l);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const view = campaignView(campaign, campaignErr, DEMO_MODE, DEMO_CAMPAIGN);
  const active = view.state === "data" ? view.campaign : null;

  // A run folded in by a re-analyze (or gone with a fresh upload) closes its
  // tab rather than lingering on a run the campaign no longer has. Keyed on
  // the run ids, and skipped while loading or errored, so a dropped
  // connection never closes anything.
  const runIdsKey = view.state === "data" ? view.campaign.pending.map((r) => r.id).join(",") : view.state === "none" ? "" : null;
  useEffect(() => {
    if (runIdsKey == null) return;
    dispatch({ type: "prune", runIds: new Set(runIdsKey ? runIdsKey.split(",") : []) });
  }, [runIdsKey]);

  const editorTabs: EditorTab[] = tabs.open.map((t) => {
    if (t.kind === "batch") return { key: tabKey(t), title: "Next batch", icon: <FileText className={TAB_ICON} aria-hidden /> };
    if (t.kind === "progress") return { key: tabKey(t), title: "Progress", icon: <LineChart className={TAB_ICON} aria-hidden /> };
    const run = active?.pending.find((r) => r.id === t.runId);
    return {
      key: tabKey(t),
      title: `Run ${shortId(t.runId)}`,
      icon: run?.awaiting === false ? (
        <CircleCheck className={`${TAB_ICON} text-green`} aria-hidden />
      ) : (
        <CircleDashed className={`${TAB_ICON} text-amber`} aria-hidden />
      ),
    };
  });

  const current = tabs.open.find((t) => tabKey(t) === tabs.active) ?? null;
  const demo = view.state === "data" && view.demo;

  let panel;
  if (current == null) {
    panel = (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[12px] text-muted">No open editors. Open a run from the explorer, or:</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => dispatch({ type: "open", tab: { kind: "batch" } })}>
            Next batch
          </Button>
          <Button variant="outline" size="sm" onClick={() => dispatch({ type: "open", tab: { kind: "progress" } })}>
            Progress
          </Button>
        </div>
      </div>
    );
  } else if (current.kind === "batch") {
    panel = (
      <BatchPanel
        latest={latest}
        state={queueState(latest, latestErr)}
        demoMode={DEMO_MODE}
        outOfSync={active != null && !demo && active.analysis_in_sync === false}
        onRetry={refresh}
        busy={busy}
      />
    );
  } else if (current.kind === "progress") {
    panel = <ProgressPanel campaign={active} error={view.state === "error"} demo={demo} />;
  } else {
    const run = active?.pending.find((r) => r.id === current.runId);
    panel =
      view.state === "error" ? (
        <CampaignError onRetry={refresh} busy={busy} />
      ) : run && active ? (
        <RunPanel run={run} campaign={active} demo={demo} />
      ) : (
        <p className="p-4 text-[12px] text-muted">Loading run…</p>
      );
  }

  return (
    <section aria-label="Live campaign workbench" className="@container overflow-hidden rounded-[14px] border border-border bg-card">
      {/* Side by side only when the workbench itself is wide enough (a
          container query, not a viewport breakpoint: the app sidebar already
          takes ~235px of the viewport), stacked otherwise. */}
      <div className="grid @3xl:min-h-[440px] @3xl:grid-cols-[232px_minmax(0,1fr)]">
        <aside aria-label="Explorer" className="flex min-w-0 flex-col border-b border-border bg-bg @3xl:border-r @3xl:border-b-0">
          <div className="flex h-[34px] shrink-0 items-center justify-between gap-2 border-b border-border pr-1 pl-3">
            <span className="text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">Explorer</span>
            <span className="flex items-center gap-1">
              {demo ? <DemoBadge /> : null}
              <button
                type="button"
                aria-label="Refresh campaign"
                onClick={refresh}
                disabled={busy}
                className="grid size-6 place-items-center rounded-[4px] text-muted hover:bg-blue-soft hover:text-fg disabled:opacity-50"
              >
                <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
              </button>
            </span>
          </div>
          <div className="max-h-[260px] min-h-0 flex-1 overflow-y-auto @3xl:max-h-none">
            {view.state === "loading" ? (
              <p className="px-3 py-2 font-mono text-[11px] text-muted">loading campaign…</p>
            ) : view.state === "error" ? (
              <CampaignError onRetry={refresh} busy={busy} compact />
            ) : view.state === "none" ? (
              <div className="flex flex-col gap-2 px-3 py-3 text-[12px] text-muted">
                <p className="font-semibold text-fg">No campaign yet</p>
                <p>
                  Upload a run sheet on{" "}
                  <Link href="/campaign/setup" className="font-semibold text-accent-text hover:underline">
                    Analyze
                  </Link>
                  , then pick and start runs on{" "}
                  <Link href="/campaign/plan" className="font-semibold text-accent-text hover:underline">
                    Decide
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <Explorer campaign={view.campaign} activeKey={tabs.active} onOpen={(tab) => dispatch({ type: "open", tab })} />
            )}
          </div>
        </aside>
        <div className="flex min-w-0 flex-col">
          <EditorTabs
            tabs={editorTabs}
            active={tabs.active}
            panelId={panelId}
            onActivate={(key) => dispatch({ type: "activate", key })}
            onClose={(key) => dispatch({ type: "close", key })}
          />
          <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabs.active ? `${panelId}-tab-${tabs.active}` : undefined}
            tabIndex={0}
            className="min-h-[300px] flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-inset"
          >
            {panel}
          </div>
        </div>
      </div>
      <StatusBar view={view} onRetry={refresh} busy={busy} />
    </section>
  );
}
