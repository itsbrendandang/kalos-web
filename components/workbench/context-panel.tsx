"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  Crosshair,
  Database,
  PanelRightClose,
  Search,
  SlidersHorizontal,
  Trophy,
  X,
} from "lucide-react";
import { ExampleBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssistNext, useAssistStatus, useDefaultCampaignId } from "@/hooks/use-assist";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { ask, canAsk, safeActionRoute, searchCampaign, type AskAnswer, type AssistNext, type AssistStatus, type SearchResult } from "@/lib/assist";
import { campaignStage } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { describeEngineError } from "@/lib/engine-error";
import { formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { CAMPAIGN_STAGES } from "@/lib/routes";
import { campaignView } from "@/lib/workbench";

const ICON = "size-4 shrink-0 text-fg-muted";
const MAX_QUESTION = 500;

/**
 * The right-hand assistant, beside the stage pages and Data on wide screens.
 * Everything in it comes from the engine: coverage from /api/campaign, the
 * next step from /api/assist/next (or the web's own stage logic on older
 * engines), keyword search over the campaign's records, and Ask only when
 * the engine has a language model configured. It never generates numbers of
 * its own and never shows a prompt box that cannot answer.
 */
export function ContextPanel({ onClose }: { onClose: () => void }) {
  const status = useAssistStatus();
  const s = status.status === "data" ? status.data : null;
  return (
    <aside aria-label="Assistant" className="hidden w-[360px] shrink-0 flex-col border-l border-border-strong bg-surface xl:flex">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg px-4">
        <h2 className="flex-1 text-caption text-fg">Assistant</h2>
        <ModelLabel status={s} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide assistant"
          className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg"
        >
          <PanelRightClose className="size-4" aria-hidden />
        </button>
      </div>
      <PanelBody status={s} />
    </aside>
  );
}

/** Which model answers, and whether it runs on this machine; nothing when Ask is off. */
function ModelLabel({ status }: { status: AssistStatus | null }) {
  if (!canAsk(status)) return null;
  return (
    <span className="truncate text-caption text-fg-muted" title={status!.local ? "Runs on this machine" : "Sends the question and cited records to an outside service"}>
      {status!.model ?? status!.provider} · {status!.local ? "local" : "external"}
    </span>
  );
}

function Box({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border bg-bg px-3">
        <h3 className="text-caption font-medium text-fg-muted">{title}</h3>
        {meta ? <span className="text-caption text-fg-muted">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex h-10 items-center gap-2.5 border-b border-border px-3 last:border-b-0">
      {icon}
      <dt className="min-w-0 flex-1 truncate text-body text-fg">{label}</dt>
      <dd className="text-body text-fg tabular-nums">{value}</dd>
    </div>
  );
}

type Reply = { kind: "search"; query: string; result: SearchResult } | { kind: "ask"; query: string; result: AskAnswer } | { kind: "error"; query: string; message: string };

function PanelBody({ status }: { status: AssistStatus | null }) {
  const campaign = useCampaign();
  const campaignId = useDefaultCampaignId();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);

  const askable = canAsk(status);
  const id = campaignId.status === "data" ? campaignId.data : null;
  // Search needs a real campaign on an engine that has the route; demo data has none.
  const searchable = id != null && view.state === "data" && !view.demo;

  async function submit(query: string) {
    setBusy(true);
    try {
      if (askable) setReply({ kind: "ask", query, result: await ask(query, id) });
      else if (id) setReply({ kind: "search", query, result: await searchCampaign(id, query) });
    } catch (e) {
      setReply({ kind: "error", query, message: describeEngineError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {reply ? <ReplyView reply={reply} onClear={() => setReply(null)} /> : null}
        <ContextBody />
      </div>
      {askable || searchable ? (
        <div className="shrink-0 p-4 pt-0">
          <Composer busy={busy} mode={askable ? "ask" : "search"} onSubmit={(q) => void submit(q)} />
        </div>
      ) : null}
    </>
  );
}

function Composer({ busy, mode, onSubmit }: { busy: boolean; mode: "ask" | "search"; onSubmit: (q: string) => void }) {
  const [value, setValue] = useState("");
  const label = mode === "ask" ? "Ask about this campaign" : "Search this campaign";
  const send = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    onSubmit(q);
  };
  return (
    <form onSubmit={send} className="flex items-center gap-2 rounded-2xl border border-border bg-surface py-2 pr-2 pl-4 shadow-card has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid">
      {mode === "search" ? <Search className={ICON} aria-hidden /> : null}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_QUESTION))}
        aria-label={label}
        placeholder={mode === "ask" ? "Ask about your runs and results" : "Search runs, columns and rounds"}
        data-composer-input
        className="h-9 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
      />
      <button
        type="submit"
        disabled={busy || value.trim() === ""}
        aria-label={busy ? "Working" : mode === "ask" ? "Ask" : "Search"}
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-ink-fg disabled:opacity-40"
      >
        <ArrowUp className="size-4" aria-hidden />
      </button>
    </form>
  );
}

function ReplyView({ reply, onClear }: { reply: Reply; onClear: () => void }) {
  return (
    <section aria-label="Answer" aria-live="polite" className="mb-4 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-start gap-2 border-b border-border bg-bg px-3 py-2">
        <p className="min-w-0 flex-1 text-caption text-fg-muted">
          <span className="sr-only">You asked: </span>
          {reply.query}
        </p>
        <button type="button" onClick={onClear} aria-label="Clear the answer" className="grid size-6 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg">
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-3 p-3">
        {reply.kind === "error" ? <p className="text-body text-fg">{reply.message}</p> : null}
        {reply.kind === "search" ? <SearchHits result={reply.result} /> : null}
        {reply.kind === "ask" ? <AskReply result={reply.result} /> : null}
      </div>
    </section>
  );
}

function SearchHits({ result }: { result: SearchResult }) {
  if (result.hits.length === 0) return <p className="text-body text-fg-muted">Nothing in this campaign matches.</p>;
  return (
    <>
      <ol className="flex flex-col gap-2">
        {result.hits.map((h) => (
          <li key={`${h.kind}:${h.id}`} className="rounded-lg border border-border px-3 py-2">
            <p className="text-label text-fg">{h.title}</p>
            <p className="mt-0.5 line-clamp-3 text-caption text-fg-muted">{h.text}</p>
          </li>
        ))}
      </ol>
      <p className="text-caption text-fg-muted">
        Records ranked by {result.retriever === "embeddings" ? "meaning" : "matching words"}; nothing here is generated.
      </p>
    </>
  );
}

function AskReply({ result }: { result: AskAnswer }) {
  if (result.abstained) {
    return (
      <>
        <p className="text-body text-fg">Nothing in this campaign&apos;s data or the docs answers that.</p>
        {result.next ? <p className="text-body text-fg-muted">Next step: {result.next.step}. {result.next.why}</p> : null}
      </>
    );
  }
  return (
    <>
      <p className="text-body whitespace-pre-line text-fg">{result.answer}</p>
      {result.sources.length ? (
        <div>
          <h4 className="text-caption font-medium text-fg-muted">Sources</h4>
          <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5 text-caption text-fg-muted">
            {result.sources.map((s, i) => (
              <li key={`${s.kind}:${s.id}:${i}`}>
                <span className="text-fg">{sourceLabel(s.kind, s.id)}</span>
                {s.quote ? <>: &ldquo;{s.quote}&rdquo;</> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <p className="text-caption text-fg-muted">
        Written by a language model from the cited records{result.offline_fallback ? ", using the offline fallback" : ""}. Numbers come only from your data.
      </p>
    </>
  );
}

function ContextBody() {
  const pathname = usePathname();
  const latest = useLatest();
  const campaign = useCampaign();
  const next = useAssistNext();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);

  // The top bar already shows the connection fault and its retry; one line here is enough.
  if (view.state === "error" || latest.status === "error") {
    return <p className="text-body text-fg-muted">The campaign could not be loaded because the engine did not answer.</p>;
  }
  if (view.state === "loading" || !latest.data) {
    return (
      <div role="status" aria-label="Loading the campaign" className="flex flex-col gap-3">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  const demo = view.state === "data" && view.demo;
  const active = view.state === "data" ? view.campaign : null;
  const stage = campaignStage(demo ? { has_data: true } : latest.data, active ?? { has_campaign: false });
  // The engine's step wins on a real campaign; demo data and older engines use the web's own stage logic.
  const engineNext: AssistNext | null = !demo && next.status === "data" ? next.data : null;
  const step = engineNext
    ? {
        title: engineNext.step,
        why: engineNext.why,
        more: engineNext.why_it_matters,
        href: safeActionRoute(engineNext.action_route),
        // The engine can list the same finding once per affected column; say it once.
        blockers: engineNext.blockers.filter((b, i, all) => all.findIndex((o) => o.code === b.code && o.text === b.text) === i),
      }
    : { title: stage.next.action, why: stage.next.reason, more: null, href: stage.next.href, blockers: [] };

  return (
    <div className="flex flex-col gap-4">
      {active ? (
        <Box title="Data coverage" meta={demo ? <ExampleBadge className="h-5" /> : stage.round ? `Round ${stage.round}` : undefined}>
          <dl>
            <Row icon={<Crosshair className={ICON} aria-hidden />} label="Target" value={<span className="font-mono text-code">{active.target}</span>} />
            <Row icon={<Database className={ICON} aria-hidden />} label="Runs in the dataset" value={formatNumber(active.n_base, "count")} />
            <Row icon={<SlidersHorizontal className={ICON} aria-hidden />} label="Inputs" value={formatNumber(active.features.length, "count")} />
            <Row icon={<CircleDashed className={ICON} aria-hidden />} label="Awaiting results" value={formatNumber(active.n_awaiting, "count")} />
            <Row icon={<CircleCheck className={ICON} aria-hidden />} label="Measured this round" value={formatNumber(active.n_measured, "count")} />
            <Row icon={<Trophy className={ICON} aria-hidden />} label="Best so far, measured" value={formatNumber(active.best)} />
          </dl>
          {!demo && active.analysis_in_sync === false ? (
            <p className="border-t border-border px-3 py-2.5 text-caption text-fg-muted">
              Runs changed since the last analysis, so the proposed batch is out of date. Learn plans a new batch once results are in.
            </p>
          ) : null}
        </Box>
      ) : (
        <p className="text-body text-fg-muted">No campaign yet. Upload a run sheet to start one.</p>
      )}

      <Box title="Next step">
        <div className="flex flex-col gap-2 p-3">
          <p className="text-label text-fg">{step.title}</p>
          <p className="text-body text-fg-muted">{step.why}</p>
          {step.more ? <p className="text-caption text-fg-muted">{step.more}</p> : null}
          {step.blockers.length ? (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-caption text-fg-muted">
              {step.blockers.map((b, i) => (
                <li key={i}>{b.text}</li>
              ))}
            </ul>
          ) : null}
          {/* On the page the step lives on, the page's own button is the action; no second one here. */}
          {step.href && step.href !== pathname ? (
            <Link
              href={step.href}
              className="mt-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-label text-accent-fg hover:bg-accent-hover"
            >
              Open {CAMPAIGN_STAGES.find((s) => s.href === step.href)?.label ?? "the page"}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      </Box>

      {active ? (
        <Box title="Explore">
          <ul className="flex flex-col gap-2 p-3">
            {EXPLORE.map((e) => (
              <li key={e.href}>
                <Link
                  href={e.href}
                  className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-body text-fg hover:border-border-strong hover:bg-bg"
                >
                  <span className="flex-1">{e.label(active.target)}</span>
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}
    </div>
  );
}

/** Questions people ask, each answered by a real page, never by generated text. */
const EXPLORE: { href: string; label: (target: string) => string }[] = [
  { href: "/campaign/plan", label: (t) => `Which recipes should we try next for ${t}?` },
  { href: "/campaign/learn", label: (t) => `Which inputs move ${t} the most, and how have predictions held up?` },
  { href: "/campaign/run", label: () => "Which runs are still waiting for a result?" },
  { href: "/campaign/setup", label: () => "Did the run sheet pass the data checks?" },
];

/** "row:42" of kind "row" reads "Row 42"; a round id is the engine's 0-based round, shown 1-based. */
export function sourceLabel(kind: string, id: string): string {
  const bare = id.startsWith(`${kind}:`) ? id.slice(kind.length + 1) : id;
  const name = kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, " ");
  if (kind === "round" && /^\d+$/.test(bare)) return `Round ${Number(bare) + 1}`;
  return `${name} ${bare}`;
}

