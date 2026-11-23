"use client";

import Link from "next/link";
import { Database, FileCheck, FlaskConical, GitCompareArrows } from "lucide-react";
import { useCampaign, useCampaignId, useLatest } from "@/hooks/use-engine";
import { campaignHref } from "@/lib/routes";

/** An index, not a joined dataset: each destination owns its own engine provenance. */
export function CampaignDataMap() {
  const id = useCampaignId();
  const latest = useLatest();
  const campaign = useCampaign();
  const analysis = latest.data?.has_data ? latest.data : null;
  const active = campaign.data?.has_campaign ? campaign.data : null;
  const entries = [
    { title: "Study & source", detail: analysis?.run?.filename ?? "Source metadata, column roles and quality checks", page: "harmonize" as const, anchor: "#your-data", icon: Database },
    { title: "Measured run log", detail: active ? "Started recipes, recorded results and their versions" : "No active campaign run log reported yet", page: "validate" as const, anchor: "#run-log", icon: FlaskConical },
    { title: "Model evidence", detail: "Held-out predictions, coverage and model caveats", page: "predict" as const, anchor: "", icon: GitCompareArrows },
    { title: "Data package", detail: "Raw rows, result history and traceable exports", page: "report" as const, anchor: "", icon: FileCheck },
  ];
  return <nav aria-label="Campaign research data" className="flex min-w-0 flex-col gap-3">
    <div><h2 className="text-heading text-fg">Follow the evidence</h2><p className="mt-1 text-caption text-fg-muted">Source data, lab records and model checks stay separate. No row-level join is inferred.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{entries.map((entry) => <Link key={entry.title} href={`${campaignHref(id, entry.page)}${entry.anchor}`} className="min-w-0 rounded-xl bg-subtle p-4 hover:bg-accent-soft"><entry.icon className="mb-3 size-4 text-fg-muted" aria-hidden /><span className="block text-label text-fg">{entry.title}</span><span className="mt-1 block break-words text-caption text-fg-muted">{entry.detail}</span></Link>)}</div>
  </nav>;
}
