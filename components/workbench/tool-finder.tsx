"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUp, ArrowUpRight, Beaker, FlaskConical, Search } from "lucide-react";
import { CAMPAIGN_STAGES, LIBRARY_ITEMS, NAV_ITEMS } from "@/lib/routes";

const KEYWORDS: Record<string, string> = {
  "/library/scale-up": "scaleup scaling bioprocess prediction oxygen transfer kla agitation rpm airflow",
  "/library/plate": "well microplate qc growth curves",
  "/library/vessels": "bioreactor ambr kinetics titer qp viability glucose lactate",
  "/library/simulator": "synthetic benchmark optimization",
  "/campaign/setup": "upload csv xlsx target data quality",
  "/campaign/plan": "experiment planning experiments batch recipe acquisition",
  "/campaign/record": "measurement measurements results",
  "/campaign/learn": "model fit drivers importance analysis",
};

const TOOLS = [...LIBRARY_ITEMS, ...CAMPAIGN_STAGES, NAV_ITEMS.find((n) => n.key === "data")!];
const SUGGESTIONS = [
  { href: "/library/scale-up", label: "Predict at a larger scale", icon: Beaker },
  { href: "/library/plate", label: "Analyze a plate", icon: Search },
  { href: "/campaign/plan", label: "Plan experiments", icon: FlaskConical },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** A local route finder, not a chat or an analysis request. Calculations stay in their existing tools. */
export function ToolFinder() {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const matches = TOOLS.filter((tool) => {
    const text = normalize(`${tool.label} ${tool.description} ${KEYWORDS[tool.href] ?? ""}`);
    return terms.every((term) => text.includes(term));
  });
  const showResults = terms.length > 0 || expanded;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExpanded(true);
  }

  return (
    <section aria-label="Find a bioprocess tool" className="mx-auto flex w-full max-w-[800px] flex-col gap-5 py-7 sm:py-12">
      <header className="text-center">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-fg sm:text-[30px]">What would you like to optimize?</h1>
        <p className="mt-3 text-body text-fg-muted sm:text-[16px]">Explore your data. Calculate, plan, and improve your bioprocess.</p>
      </header>

      <form role="search" aria-label="Bioprocess tools" onSubmit={submit} className="mt-2 rounded-2xl border border-border-input bg-surface p-2 shadow-[0_2px_3px_0_#18181805,0_6px_20px_0_#18181808] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        <label htmlFor={id} className="sr-only">Find tools and calculations</label>
        <input
          id={id}
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setExpanded(false); }}
          placeholder="Find a tool or calculation…"
          aria-describedby={`${id}-help`}
          aria-controls={`${id}-results`}
          className="h-16 w-full min-w-0 bg-transparent px-3 text-[16px] text-fg outline-none placeholder:text-fg-muted"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1">
          <span className="inline-flex items-center gap-2 text-caption text-fg-muted"><FlaskConical className="size-3.5" aria-hidden />Bioprocess tools</span>
          <button type="submit" className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-3 text-caption font-medium text-accent-fg hover:bg-accent-hover">
            Find tools<ArrowUp className="size-4" aria-hidden />
          </button>
        </div>
      </form>
      <p id={`${id}-help`} className="-mt-3 px-1 text-caption text-fg-muted">Search Kalos tools and campaign steps. Open a tool to work with your data.</p>

      <div id={`${id}-results`}>
        {showResults ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-caption text-fg-muted">{matches.length} {matches.length === 1 ? "tool" : "tools"} found</p>
            {matches.length > 0 ? (
              <ul aria-label="Matching tools" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {matches.map((tool) => (
                  <li key={tool.href}>
                    <Link href={tool.href} className="group flex items-center gap-4 px-4 py-3 hover:bg-subtle">
                      <span className="min-w-0 flex-1"><span className="block text-label text-fg">{tool.label}</span><span className="mt-1 block text-caption text-fg-muted">{tool.description}</span></span>
                      <ArrowRight className="size-4 shrink-0 text-fg-muted group-hover:text-fg" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-body text-fg">Try “scale-up”, “plate”, or “measurements”, or <Link href="/library" className="underline underline-offset-4">browse the library</Link>.</p>}
          </div>
        ) : (
          <ul aria-label="Suggested tools" className="flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
            {SUGGESTIONS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="inline-flex min-h-10 w-full items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-caption text-fg hover:bg-border/60">
                  <Icon className="size-3.5 shrink-0 text-fg-muted" aria-hidden />{label}<ArrowUpRight className="ml-auto size-3.5 shrink-0 text-fg-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
