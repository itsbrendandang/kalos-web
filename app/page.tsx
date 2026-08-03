"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Activity, Upload } from "lucide-react";
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
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1.5 shadow-[0_1px_2px_rgba(20,35,28,0.04)]">
      {VIEWS.map((v) => (
        <Link
          key={v.key}
          href={v.key === "live" ? "/" : `/?view=${v.key}`}
          aria-pressed={view === v.key}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-4 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors",
            view === v.key ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-blue-soft hover:text-fg",
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
        eyebrow="Experiment loop"
        title="Experiments"
        desc="Move from measured runs to a reliable next batch, without losing the evidence behind the recommendation."
        action={
          <Link href="/analyze" className={buttonVariants()}>
            <Upload />
            Analyze run sheet
          </Link>
        }
      />

      <div className="grid overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-[1.25fr_1fr_1fr_1fr]">
        <div className="flex min-h-20 items-center gap-3 bg-sidebar px-5 py-4 text-white">
          <span className="grid size-9 place-items-center rounded-xl bg-accent"><Activity className="size-4" /></span>
          <div><div className="text-[11px] font-bold tracking-[0.1em] text-white/60 uppercase">Current loop</div><div className="mt-0.5 text-sm font-semibold">Prepare your evidence</div></div>
        </div>
        {["Analyze", "Decide", "Run"].map((step, index) => (
          <div key={step} className="flex min-h-16 items-center gap-3 border-t border-border px-5 py-3 sm:min-h-20 sm:border-t-0 sm:border-l">
            <span className="font-mono text-[11px] font-semibold text-accent-text">0{index + 2}</span>
            <span className="text-[13px] font-semibold text-muted">{step}</span>
          </div>
        ))}
      </div>

      <Suspense fallback={<Loading label="Loading view" />}>
        <HubBody />
      </Suspense>
    </div>
  );
}
