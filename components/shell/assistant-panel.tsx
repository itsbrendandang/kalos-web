"use client";

/*
 * The assistant panel (DESIGN.md "App frame"): the right-hand column inside a
 * campaign at xl widths. Everything in it is the engine's, never generated
 * here: the guide's next step (GET /api/assist/next, works with no language
 * model) and a search over this campaign's own records
 * (GET /api/campaigns/{id}/search). Free-text Ask is not offered: the web
 * proxy does not forward POST /api/assist/ask (see lib/server/engine-routes.ts).
 */

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssistNext } from "@/hooks/use-assist";
import { useOptionalCampaignData } from "@/hooks/use-engine";
import { assistActionHref, searchCampaign, SEARCH_MAX_QUERY, type SearchResult } from "@/lib/assist";
import { errorMessage } from "@/lib/engine-error";

type Reply = { query: string } & ({ state: "loading" } | { state: "error"; message: string } | { state: "data"; result: SearchResult });

export function AssistantPanel() {
  const data = useOptionalCampaignData();
  if (!data) return null;
  // Keyed by campaign so a switch never shows the previous campaign's step or results.
  return <PanelBody key={data.campaignId} campaignId={data.campaignId} />;
}

function PanelBody({ campaignId }: { campaignId: string }) {
  const [reply, setReply] = useState<Reply | null>(null);

  async function search(q: string) {
    setReply({ query: q, state: "loading" });
    try {
      const result = await searchCampaign(campaignId, q);
      setReply((r) => (r?.query === q ? { query: q, state: "data", result } : r));
    } catch (e) {
      setReply((r) => (r?.query === q ? { query: q, state: "error", message: errorMessage(e).message } : r));
    }
  }

  return (
    <aside aria-label="Assistant" className="flex min-h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <h2 className="text-label text-fg">Assistant</h2>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Always mounted, so a new result is announced. */}
        <div aria-live="polite">{reply ? <ReplyView reply={reply} onClear={() => setReply(null)} /> : null}</div>
        <NextStep campaignId={campaignId} />
      </div>
      <SearchBox busy={reply?.state === "loading"} onSearch={search} />
    </aside>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-border bg-bg">
      <h3 className="border-b border-border px-3 py-2 text-caption font-medium text-fg-muted">{title}</h3>
      <div className="flex flex-col gap-2 p-3">{children}</div>
    </section>
  );
}

function NextStep({ campaignId }: { campaignId: string }) {
  const pathname = usePathname() ?? "";
  const next = useAssistNext(campaignId);

  // An engine without the guide: say nothing rather than invent a step (the page's own next card still shows).
  if (next.unsupported) return null;
  if (next.status === "loading" && !next.data) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (!next.data) {
    return (
      <Box title="Next step">
        <p className="text-body text-fg-muted">The next step could not be loaded. {errorMessage(next.failure).message}</p>
      </Box>
    );
  }

  const n = next.data;
  const href = assistActionHref(campaignId, n.action_route);
  // The engine can list one finding once per affected column; say it once.
  const blockers = n.blockers.filter((b, i, all) => all.findIndex((o) => o.code === b.code && o.text === b.text) === i);
  const onTarget = href != null && href.split("#")[0] === pathname;
  return (
    <Box title="Next step">
      <p className="text-label text-fg">{n.step}</p>
      {n.why ? <p className="text-body text-fg-muted">{n.why}</p> : null}
      {n.why_it_matters ? <p className="text-caption text-fg-muted">{n.why_it_matters}</p> : null}
      {blockers.length ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-caption text-fg-muted">
          {blockers.map((b) => (
            <li key={`${b.code}:${b.text}`}>{b.text}</li>
          ))}
        </ul>
      ) : null}
      {/* On the page the step lives on, that page's own button is the action. */}
      {href && !onTarget ? (
        <Link
          href={href}
          className="mt-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-label text-accent-fg hover:bg-accent-hover"
        >
          Go there
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </Box>
  );
}

function ReplyView({ reply, onClear }: { reply: Reply; onClear: () => void }) {
  return (
    <section aria-label="Search results" className="rounded-xl border border-border bg-bg">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-caption text-fg-muted" title={reply.query}>
          {reply.query}
        </p>
        <button type="button" onClick={onClear} aria-label="Clear the search" className="rounded-md p-1 text-fg-muted hover:bg-subtle hover:text-fg">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {reply.state === "loading" ? (
          <p role="status" className="text-body text-fg-muted">
            Searching this campaign...
          </p>
        ) : reply.state === "error" ? (
          <p className="text-body text-fg-muted">The search did not run. {reply.message}</p>
        ) : reply.result.hits.length === 0 ? (
          <p className="text-body text-fg-muted">Nothing in this campaign&apos;s records matches that.</p>
        ) : (
          <>
            <ol className="flex flex-col gap-2">
              {reply.result.hits.map((h) => (
                <li key={`${h.kind}:${h.id}`} className="rounded-lg border border-border bg-surface px-3 py-2">
                  <p className="text-label text-fg">{h.title}</p>
                  <p className="mt-0.5 line-clamp-3 text-caption text-fg-muted">{h.text}</p>
                </li>
              ))}
            </ol>
            <p className="text-caption text-fg-muted">
              Records ranked by {reply.result.retriever === "embeddings" ? "meaning" : "matching words"}; nothing here is generated.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function SearchBox({ busy, onSearch }: { busy: boolean; onSearch: (q: string) => void }) {
  const [q, setQ] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const t = q.trim();
    if (t && !busy) onSearch(t);
  }
  return (
    <form role="search" onSubmit={submit} className="sticky bottom-0 border-t border-border bg-surface p-3">
      <label className="flex items-center gap-2 rounded-xl border border-border-input bg-surface px-3 shadow-card focus-within:border-accent">
        <Search className="size-4 shrink-0 text-fg-muted" aria-hidden />
        <span className="sr-only">Search this campaign</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={SEARCH_MAX_QUERY}
          placeholder="Search runs, columns and rounds"
          className="h-10 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
        />
        <button
          type="submit"
          disabled={!q.trim() || busy}
          aria-label="Search"
          className="inline-flex size-7 items-center justify-center rounded-lg bg-ink text-ink-fg disabled:bg-subtle disabled:text-fg-muted"
        >
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </label>
    </form>
  );
}
