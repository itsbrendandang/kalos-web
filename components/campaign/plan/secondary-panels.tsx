"use client";

import type { Ref } from "react";
import { Comparison } from "@/components/campaign/plan/comparison";
import { MethodDetails } from "@/components/campaign/plan/method";
import { ResponseSurface2D } from "@/components/campaign/plan/response-surface";
import type { BatchModel } from "@/components/campaign/plan/use-batch-model";
import type { PlanRow } from "@/components/campaign/plan/types";
import { COMPARE_MIN, type PlanAnalysis } from "@/components/campaign/plan-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PlanTab = "compare" | "surface" | "method";

/**
 * The detail that answers "why" and "compare these" sits under secondary tabs,
 * below the batch. Only the open tab mounts, so the surface draws on demand.
 */
export function SecondaryPanels({
  d,
  m,
  tab,
  onTabChange,
  compared,
  onRemove,
  onClear,
  rootRef,
}: {
  d: PlanAnalysis;
  m: BatchModel;
  tab: PlanTab;
  onTabChange: (tab: PlanTab) => void;
  compared: PlanRow[];
  onRemove: (rank: number) => void;
  onClear: () => void;
  rootRef: Ref<HTMLElement>;
}) {
  const surface = m.surface;
  return (
    <section ref={rootRef} aria-label="More on this batch" className="flex scroll-mt-6 flex-col gap-3">
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as PlanTab)}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="compare">{compared.length ? `Compare (${compared.length})` : "Compare"}</TabsTrigger>
          {surface ? <TabsTrigger value="surface">Response surface</TabsTrigger> : null}
          <TabsTrigger value="method">Method</TabsTrigger>
        </TabsList>
        <TabsContent value="compare" className="pt-4">
          {compared.length >= COMPARE_MIN ? (
            <Comparison rows={compared} ctx={m.ctx} onRemove={onRemove} onClear={onClear} />
          ) : (
            <p className="max-w-[72ch] text-body text-fg-muted">
              Choose Compare on {COMPARE_MIN} to 5 proposals in the table to see them side by side, with the inputs where they differ.
            </p>
          )}
        </TabsContent>
        {surface ? (
          <TabsContent value="surface" className="pt-4">
            <ResponseSurface2D surface={d.response_surface} target={m.name} proposals={m.surfacePoints} />
          </TabsContent>
        ) : null}
        <TabsContent value="method" className="pt-4">
          <MethodDetails d={d} m={m} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

