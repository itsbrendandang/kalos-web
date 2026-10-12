"use client";

import { usePathname } from "next/navigation";
import { Circle, CircleCheck, CircleDashed, CircleDot, FileSpreadsheet, FolderOpen, History, LayoutDashboard, Wrench } from "lucide-react";
import { ExplorerTree, type TreeLeaf, type TreeNode } from "@/components/workbench/explorer-tree";
import { useProjectsStore } from "@/components/projects/store-context";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { campaignStage, type StepState } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { DATASETS } from "@/lib/mock/registry";
import { LIBRARY_ITEMS, type NavKey } from "@/lib/routes";
import { campaignView, inFlight, measured, shortId } from "@/lib/workbench";

const ICON = "size-4 shrink-0";

const STEP_ICON: Record<StepState, React.ReactNode> = {
  done: <CircleCheck className={`${ICON} text-good`} aria-hidden />,
  current: <CircleDot className={`${ICON} text-accent`} aria-hidden />,
  upcoming: <Circle className={`${ICON} text-fg-muted`} aria-hidden />,
};

const STEP_WORD: Record<StepState, string> = { done: "done", current: "current", upcoming: "upcoming" };

/** Whether the current section shows an example-data label in the explorer header. */
export function useExplorerIsExample(section: NavKey): boolean {
  const campaign = useCampaign();
  if (section === "projects") return true;
  if (section === "data") return DEMO_MODE;
  if (section !== "campaign") return false;
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  return view.state === "data" && view.demo;
}

/** The explorer tree for one rail section. Settings has none. */
export function SectionExplorer({ section }: { section: NavKey }) {
  if (section === "campaign") return <CampaignExplorer />;
  if (section === "data") return <DataExplorer />;
  if (section === "library") return <LibraryExplorer />;
  if (section === "projects") return <ProjectsExplorer />;
  return null;
}

function CampaignExplorer() {
  const pathname = usePathname();
  const latest = useLatest();
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);

  if (view.state === "error" || latest.status === "error") {
    return (
      <div className="p-2">
        <ErrorState
          title="Could not load the campaign"
          description="The engine did not answer. This is a connection problem, not an empty campaign."
          onRetry={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
          busy={campaign.refreshing || latest.refreshing}
        />
      </div>
    );
  }
  if (view.state === "loading" || latest.status === "loading") {
    return <LoadingSkeleton rows={6} label="Loading the campaign" className="p-4" />;
  }

  const active = view.state === "data" ? view.campaign : null;
  const stage = campaignStage(view.state === "data" && view.demo ? { has_data: true } : latest.data!, active ?? { has_campaign: false });

  const overview: TreeLeaf = {
    kind: "leaf",
    key: "overview",
    href: "/",
    label: "Overview",
    icon: <LayoutDashboard className={`${ICON} text-fg-muted`} aria-hidden />,
    name: "Overview",
  };
  const stages: TreeNode = {
    kind: "group",
    key: "stages",
    label: stage.round ? `Stages, round ${stage.round}` : "Stages",
    leaves: stage.steps.map((s) => ({
      kind: "leaf",
      key: `stage:${s.key}`,
      href: s.href,
      label: s.label,
      detail: s.detail ? <span className="max-md:hidden">{s.detail}</span> : undefined,
      icon: STEP_ICON[s.state],
      name: `${s.label}, ${STEP_WORD[s.state]}${s.detail ? `: ${s.detail}` : ""}`,
    })),
  };
  if (!active) return <ExplorerTree label="Campaign" nodes={[overview, stages]} activeHref={pathname} />;

  const runLeaf = (r: (typeof active.pending)[number], awaiting: boolean): TreeLeaf => ({
    kind: "leaf",
    key: `run:${r.id}`,
    href: `/campaign/run#run-${r.id}`,
    label: shortId(r.id),
    mono: true,
    detail: awaiting ? formatNumber(r.pred) : formatNumber(r.result),
    icon: awaiting ? <CircleDashed className={`${ICON} text-warn`} aria-hidden /> : <CircleCheck className={`${ICON} text-good`} aria-hidden />,
    name: awaiting
      ? `Run ${shortId(r.id)}, awaiting a result, predicted ${formatNumber(r.pred)}`
      : `Run ${shortId(r.id)}, measured ${formatNumber(r.result)}`,
  });

  const nodes: TreeNode[] = [
    overview,
    stages,
    { kind: "group", key: "in-flight", label: "In flight", leaves: inFlight(active).map((r) => runLeaf(r, true)), empty: "None running" },
    { kind: "group", key: "measured", label: "Measured", leaves: measured(active).map((r) => runLeaf(r, false)), empty: "None this round" },
    {
      kind: "group",
      key: "rounds",
      label: "Rounds",
      empty: "No rounds yet",
      leaves: [...active.history].reverse().map((h) => ({
        kind: "leaf",
        key: `round:${h.round}`,
        href: `/campaign/learn#round-${h.round}`,
        label: h.round === 0 ? "Uploaded data" : `After round ${h.round}`,
        detail: formatNumber(h.best),
        icon: <History className={`${ICON} text-fg-muted`} aria-hidden />,
        name: `${h.round === 0 ? "Uploaded data" : `After round ${h.round}`}, best ${h.best == null ? "not measured" : formatNumber(h.best)}, ${h.n_base} runs`,
      })),
    },
  ];
  return <ExplorerTree label={`Campaign ${active.target}`} nodes={nodes} activeHref={pathname} />;
}

function DataExplorer() {
  const pathname = usePathname();
  if (!DEMO_MODE) return <p className="px-4 py-3 text-caption text-fg-muted">No live datasets are connected yet.</p>;
  const nodes: TreeNode[] = [
    {
      kind: "group",
      key: "datasets",
      label: "Datasets",
      leaves: DATASETS.map((d) => ({
        kind: "leaf",
        key: d.barcode,
        href: `/data#dataset-${d.barcode}`,
        label: d.name,
        mono: true,
        detail: formatNumber(d.runs, "count"),
        icon: <FileSpreadsheet className={`${ICON} text-fg-muted`} aria-hidden />,
        name: `${d.name}, ${d.runs} runs`,
      })),
    },
  ];
  return <ExplorerTree label="Data" nodes={nodes} activeHref={pathname} />;
}

function LibraryExplorer() {
  const pathname = usePathname();
  const nodes: TreeNode[] = LIBRARY_ITEMS.filter((i) => i.href.startsWith("/library/")).map((i) => ({
    kind: "leaf",
    key: i.href,
    href: i.href,
    label: i.label,
    icon: <Wrench className={`${ICON} text-fg-muted`} aria-hidden />,
    name: i.label,
  }));
  return <ExplorerTree label="Library" nodes={nodes} activeHref={pathname} />;
}

function ProjectsExplorer() {
  const pathname = usePathname();
  const { customers } = useProjectsStore();
  const nodes: TreeNode[] = customers.map((c) => ({
    kind: "group",
    key: c.id,
    label: c.name,
    empty: "No projects",
    leaves: c.projects.map((p) => ({
      kind: "leaf",
      key: p.id,
      href: `/projects/${p.id}`,
      label: p.name,
      icon: <FolderOpen className={`${ICON} text-fg-muted`} aria-hidden />,
      name: `${p.name}, ${c.name}`,
    })),
  }));
  return <ExplorerTree label="Projects" nodes={nodes} activeHref={pathname} />;
}

