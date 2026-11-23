"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FlaskConical, Search } from "lucide-react";
import { useCampaigns } from "@/hooks/use-engine";
import { campaignHref } from "@/lib/routes";

/** Local navigation only: no chat, inferred science, or extra engine requests. */
export function ToolFinder({ campaignId }: { campaignId?: string }) {
  const campaigns = useCampaigns();
  const [query, setQuery] = useState("");
  const inputId = useId();
  const tools = campaignId ? [
    { title: "Study source & column roles", detail: "Harmonize · source, schema and quality", href: `${campaignHref(campaignId, "harmonize")}#your-data`, aliases: "data file upload sheet provenance" },
    { title: "Design the next experiments", detail: "Predict · recipes and uncertainty", href: campaignHref(campaignId, "predict"), aliases: "prediction model optimization surface" },
    { title: "Run log", detail: "Validate · lab runs, results and learning", href: campaignHref(campaignId, "validate"), aliases: "record measurement evidence calibration" },
    { title: "Export the evidence", detail: "Report · traceable campaign package", href: campaignHref(campaignId, "report"), aliases: "download dataset catalog history" },
    { title: "Scale-up readout", detail: "Scale-up · entered conditions and engine gates", href: campaignHref(campaignId, "scale-up"), aliases: "bioprocess vessel oxygen transfer kla rpm agitation airflow" },
  ] : [
    { title: "Start a campaign", detail: "Name a study, then bring your measured runs", href: "/?new=1", aliases: "new create upload experiment data" },
    { title: "Scale-up track", detail: "Bioprocess readouts and gate decisions", href: "/scale-up", aliases: "vessel oxygen transfer kla rpm agitation airflow" },
  ];
  const entries = [
    ...tools,
    ...(campaigns.data ?? []).map((c) => ({ title: c.name, detail: "Campaign · open overview", href: campaignHref(c.id), aliases: "study campaign" })),
  ];
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = entries.filter((entry) => words.every((word) => `${entry.title} ${entry.detail} ${entry.aliases}`.toLowerCase().includes(word)));
  const shown = (words.length ? matches : tools).slice(0, 6);
  return (
    <section aria-label="Find a campaign or scientific tool" className="min-w-0 rounded-xl bg-surface px-4 py-6 sm:px-7 sm:py-8">
      <div className="mb-4 flex items-center gap-2 text-caption text-fg-muted"><FlaskConical className="size-4" aria-hidden /> Your scientific workspace</div>
      <label htmlFor={inputId} className="block text-title text-fg">What would you like to explore?</label>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-border-input bg-bg px-3 focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-4 shrink-0 text-fg-muted" aria-hidden />
        <input id={inputId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={campaignId ? "Search data, uncertainty, oxygen transfer…" : "Find a campaign or a bioprocess tool…"} className="min-w-0 flex-1 bg-transparent py-3 text-body text-fg outline-none placeholder:text-fg-muted" />
      </div>
      <p className="mt-2 text-caption text-fg-muted">Search loaded campaigns and tool views. This finder does not run a calculation.</p>
      <p className="sr-only" role="status">{words.length ? `${matches.length} matches${matches.length > 6 ? "; first 6 shown" : ""}` : "Suggested tools"}</p>
      {shown.length ? <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {shown.map((entry) => <li key={entry.href} className="min-w-0"><Link href={entry.href} className="flex h-full items-start justify-between gap-3 rounded-lg bg-subtle px-3 py-3 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0"><span className="block break-words text-label text-fg">{entry.title}</span><span className="mt-1 block text-caption text-fg-muted">{entry.detail}</span></span><ArrowUpRight className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden /></Link></li>)}
      </ul> : <p className="mt-5 text-body text-fg-muted">No matches. Try a campaign name, data, or scale-up.</p>}
    </section>
  );
}
