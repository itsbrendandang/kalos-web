"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Upload } from "lucide-react";
import { PageHeader, Loading } from "@/components/page-header";
import { OperationsView } from "@/components/operations/operations-view";
import { PlanningBoard } from "@/components/planning/planning-board";
import { ExperimentsQueue } from "@/components/experiments/experiments-queue";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HubView = "live" | "board" | "table";

const VIEWS: { key: HubView; label: string }[] = [
  { key: "live", label: "Live" },
  { key: "board", label: "Board" },
  { key: "table", label: "Table" },
];

function parseView(raw: string | null): HubView {
  return raw === "board" || raw === "table" ? raw : "live";
}

/** The view switcher tabs, styled after the segmented-button pattern in
 *  components/planning/board-toolbar.tsx. Plain links (not buttons with
 *  onClick state) so the selected view lives in the URL - shareable, and the
 *  back button moves between views. */
function HubTabs({ view }: { view: HubView }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-border bg-blue-soft p-1">
      {VIEWS.map((v) => (
        <Link
          key={v.key}
          href={v.key === "live" ? "/" : `/?view=${v.key}`}
          aria-pressed={view === v.key}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[8px] px-3.5 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors",
            view === v.key ? "bg-card text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}

/** Reads the ?view= search param and renders the matching view. Split out
 *  from the page so the useSearchParams() call - and only that call - sits
 *  inside the Suspense boundary Next.js requires for it. */
function HubBody() {
  const searchParams = useSearchParams();
  const view = parseView(searchParams.get("view"));

  return (
    <div className="flex flex-col gap-6">
      <HubTabs view={view} />
      {view === "live" ? <OperationsView /> : null}
      {view === "board" ? <PlanningBoard /> : null}
      {view === "table" ? <ExperimentsQueue /> : null}
    </div>
  );
}

/** Experiments hub: the single landing surface that replaces the old
 *  Operations / Planning / Experiments three-way split. One header, one nav
 *  entry, three views (Live · Board · Table) switched by the `view` search
 *  param - each view's body is unchanged, just relocated. */
export default function ExperimentsHubPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Lab"
        title="Experiments"
        desc="Plan, run, and track every experiment."
        action={
          <Link href="/analyze" className={buttonVariants()}>
            <Upload />
            Run analysis
          </Link>
        }
      />

      <Suspense fallback={<Loading label="Loading view" />}>
        <HubBody />
      </Suspense>
    </div>
  );
}
