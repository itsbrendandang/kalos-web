"use client";

import { useEffect, useState } from "react";
import { OVERVIEW_STAGES, OVERVIEW_STAGE_LABEL, stageStatus, withStageParam, type CampaignOverview, type OverviewStage } from "@/lib/campaign-overview";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return narrow;
}

export function StageTabs({
  model,
  stage,
  attention,
  onSelect,
  pathname,
  search,
}: {
  model: CampaignOverview;
  stage: OverviewStage | null;
  attention: OverviewStage | null;
  onSelect: (stage: OverviewStage) => void;
  pathname: string;
  search: { toString(): string };
}) {
  const vertical = useNarrowScreen();
  useEffect(() => {
    if (!stage) return;
    const tab = document.getElementById(`campaign-stage-${stage}`);
    const list = tab?.closest("[data-slot='tabs-list']");
    if (!tab || !(list instanceof HTMLElement) || typeof window.matchMedia !== "function") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const left = tab.offsetLeft - Math.max(0, (list.clientWidth - tab.clientWidth) / 2);
    list.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
  }, [stage, vertical]);

  const issue = attention && stage && attention !== stage ? attention : null;

  return (
    <div className="flex flex-col gap-2">
      <TabsList aria-label="Campaign stages" variant="overview" activateOnFocus className="max-md:w-full">
        {OVERVIEW_STAGES.map((id, index) => (
          <TabsTrigger key={id} id={`campaign-stage-${id}`} value={id}>
            {index > 0 ? <span aria-hidden className="overview-stage-arrow text-caption text-overview-fg-muted" /> : null}
            <span className="text-caption text-overview-fg-muted">{String(index + 1).padStart(2, "0")}</span>
            <span>{OVERVIEW_STAGE_LABEL[id]}</span>
            <span className="text-caption font-normal text-overview-fg-muted">{stageStatus(model, id)}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {issue ? (
        <p className="text-body text-overview-fg">
          <a
            href={withStageParam(pathname, search, issue)}
            className="text-overview-action underline-offset-4 hover:underline"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
              event.preventDefault();
              onSelect(issue);
            }}
          >
            New issue in {OVERVIEW_STAGE_LABEL[issue]}
          </a>
        </p>
      ) : null}
    </div>
  );
}

export function useStageOrientation(): "horizontal" | "vertical" {
  return useNarrowScreen() ? "vertical" : "horizontal";
}
