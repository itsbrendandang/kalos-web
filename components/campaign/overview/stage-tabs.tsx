"use client";

import { useEffect } from "react";
import { OVERVIEW_STAGES, OVERVIEW_STAGE_LABEL, stageStatus, withStageParam, type CampaignOverview, type OverviewStage } from "@/lib/campaign-overview";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  useEffect(() => {
    if (!stage) return;
    const tab = document.getElementById(`campaign-stage-${stage}`);
    const list = tab?.closest("[data-slot='tabs-list']");
    if (!tab || !(list instanceof HTMLElement)) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const left = tab.offsetLeft - list.offsetLeft;
    if (typeof list.scrollTo === "function") list.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
  }, [stage]);

  const issue = attention && stage && attention !== stage ? attention : null;

  return (
    <div className="flex flex-col gap-2">
      <TabsList aria-label="Campaign stages" variant="overview" activateOnFocus className="overview-tabs">
        {OVERVIEW_STAGES.map((id) => (
          <TabsTrigger key={id} id={`campaign-stage-${id}`} value={id}>
            <span>{OVERVIEW_STAGE_LABEL[id]}</span>
            <span className="text-caption font-normal text-overview-fg-muted">{stageStatus(model, id)}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {issue ? (
        <p className="text-body text-overview-fg">
          <a
            href={withStageParam(pathname, search, issue)}
            className="underline-offset-4 hover:underline"
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
