"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Upload } from "lucide-react";
import { PageHeader } from "@/components/kit/page-header";
import { Verdict } from "@/components/kit/verdict";
import { Section } from "@/components/kit/section";
import { Disclosure } from "@/components/kit/disclosure";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { getCampaignAnalysis, getCampaignById, listCampaigns } from "@/lib/api";
import { analysisFacts, buildIndex, campaignFacts, formatDate, indexVerdict, roundsCaption, type CampaignInput, type EngineOnlyRow, type RoundRow, type SheetRow } from "@/lib/data-index";
import { formatNumber } from "@/lib/format";
import { useStoredSheets } from "@/lib/sheet-store";

type EngineIndex = { status: "loading" } | { status: "error" } | { status: "ready"; campaigns: CampaignInput[] };

/** Every campaign on the engine with its summary and analysis, read once per mount and on retry. */
function useEngineCampaigns(): EngineIndex & { refresh: () => void; refreshing: boolean } {
  const [state, setState] = useState<EngineIndex>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    const read = async (): Promise<CampaignInput[]> => {
      const infos = await listCampaigns();
      return Promise.all(
        infos
          .filter((c) => !c.archived)
          .map(async (c) => {
            const [detail, latest] = await Promise.all([getCampaignById(c.id), getCampaignAnalysis(c.id)]);
            return { id: c.id, name: c.name, is_default: c.is_default, analysis: analysisFacts(latest), summary: campaignFacts(detail.summary) };
          }),
      );
    };
    read().then(
      (campaigns) => {
        if (live) setState({ status: "ready", campaigns });
      },
      () => {
        if (live) setState({ status: "error" });
      },
    ).finally(() => {
      if (live) setRefreshing(false);
    });
    return () => {
      live = false;
    };
  }, [attempt]);
  const refresh = useCallback(() => {
    setRefreshing(true);
    setAttempt((a) => a + 1);
  }, []);
  return { ...state, refresh, refreshing };
}

/**
 * Every run sheet this browser has loaded (lib/sheet-store.ts) joined to the engine's campaigns by the
 * sha256 of the bytes, plus the rounds the campaign has recorded. Each sheet has its own page; the rows
 * live only in this browser and are never sent anywhere again.
 */
export default function DataPage() {
  const stored = useStoredSheets();
  const engine = useEngineCampaigns();

  const campaigns = engine.status === "ready" ? engine.campaigns : [];
  const index = buildIndex({ sheets: stored.status === "ready" ? stored.sheets : [], campaigns });
  const working = (campaigns.find((c) => c.is_default) ?? campaigns[0])?.analysis ?? null;
  const loading = stored.status === "loading" || engine.status === "loading";
  const verdict = indexVerdict(index, working, engine.status === "ready");
  const nothing = !loading && verdict === "Nothing loaded yet.";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Data"
        title="Data"
        description="Every run sheet this browser has loaded, and the rounds recorded in the campaign."
        action={
          nothing ? null : (
            <Link href="/campaign/setup" className={buttonVariants({ variant: "outline" })}>
              Upload a run sheet
            </Link>
          )
        }
      />

      {loading ? (
        <LoadingSkeleton rows={4} label="Loading your data" />
      ) : nothing ? (
        <>
          <Verdict tone="neutral">{verdict}</Verdict>
          <EmptyState
            icon={Upload}
            title="No run sheet yet"
            description="Upload a run sheet in Setup. Kalos reads it and builds the model, and this browser keeps a copy so its rows can be shown here."
            action={
              <Link href="/campaign/setup" className={buttonVariants({})}>
                Upload a run sheet <ArrowRight />
              </Link>
            }
          />
        </>
      ) : (
        <>
          <Verdict tone="neutral">{verdict}</Verdict>

          {engine.status === "error" ? (
            <ErrorState
              title="Could not reach Kalos"
              description="This is a connection problem, not a result. Which sheet the campaign uses and its rounds are not known until Kalos answers. The sheets held in this browser are listed below."
              onRetry={engine.refresh}
              busy={engine.refreshing}
            />
          ) : null}

          <Section title="Sheets" description="Each sheet has its own page with the rows, the charts and how each column was read.">
            {index.sheets.length === 0 && index.engineOnly.length === 0 ? (
              <p className="text-body text-fg-muted">No sheet is held in this browser.</p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {index.sheets.map((s) => (
                  <SheetItem key={s.sha} sheet={s} engineKnown={engine.status === "ready"} />
                ))}
                {index.engineOnly.map((e) => (
                  <EngineOnlyItem key={e.campaignId} row={e} />
                ))}
              </ul>
            )}
          </Section>

          <Section title="Recorded rounds" description="The runs started from Plan and recorded in the campaign, round by round.">
            {engine.status !== "ready" ? (
              <p className="text-body text-fg-muted">Kalos could not be asked about its rounds.</p>
            ) : index.rounds.length === 0 ? (
              <p className="text-body text-fg-muted">No rounds recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {index.rounds.map((r) => (
                  <RoundItem key={`${r.campaignId}-${r.round}`} row={r} />
                ))}
              </ul>
            )}
          </Section>

          <Disclosure summary="Where this is kept">
            <p className="text-body text-fg-muted">
              This sheet is kept in this browser only, so the rows can be shown without sending them anywhere again. Remove the copy from the browser and the rows stop showing here; Kalos keeps its own copy for the campaign. Each sheet&apos;s address is the fingerprint of the sheet&apos;s bytes (SHA-256), which is how a sheet here is matched to the one Kalos read.
            </p>
          </Disclosure>
        </>
      )}
    </div>
  );
}

const DOT = " \u00b7 ";

function SheetItem({ sheet: s, engineKnown }: { sheet: SheetRow; engineKnown: boolean }) {
  const facts = [
    s.rows == null ? null : `${formatNumber(s.rows, "count")} ${s.rows === 1 ? "run" : "runs"}`,
    s.inputs == null ? null : `${formatNumber(s.inputs, "count")} ${s.inputs === 1 ? "input" : "inputs"}`,
    s.target == null ? null : `target ${s.target}`,
    `loaded ${formatDate(s.loadedAt)}`,
  ].filter((x): x is string => x != null);
  const rounds = roundsCaption(s.rounds);
  return (
    <li>
      <Link href={`/data/sheet/${s.sha}`} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 rounded-lg px-2 py-3 hover:bg-fill-hover">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="min-w-0 break-words text-heading text-fg">{s.name}</span>
          <span className="text-caption tabular-nums text-fg-muted">{facts.join(DOT)}</span>
          {rounds ? <span className="text-caption text-fg-muted">{rounds}</span> : null}
        </span>
        {engineKnown ? (
          s.usedBy ? (
            <Badge tone="accent">In use</Badge>
          ) : (
            <Badge tone="neutral">Not in use</Badge>
          )
        ) : null}
      </Link>
    </li>
  );
}

function EngineOnlyItem({ row: e }: { row: EngineOnlyRow }) {
  const facts = [
    `${formatNumber(e.rows, "count")} ${e.rows === 1 ? "run" : "runs"}`,
    `${formatNumber(e.inputs, "count")} ${e.inputs === 1 ? "input" : "inputs"}`,
    `target ${e.target}`,
    `read by Kalos ${formatDate(e.updatedAt)}`,
  ];
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-2 py-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="min-w-0 break-words text-heading text-fg">{e.dataset}</span>
        <span className="text-caption tabular-nums text-fg-muted">{facts.join(DOT)}</span>
        <span className="text-caption text-fg-muted">Rows are not held in this browser; upload the file again in Setup to see them.</span>
      </span>
      <Badge tone="neutral">Kalos has it; this browser does not</Badge>
    </li>
  );
}

function RoundItem({ row: r }: { row: RoundRow }) {
  const facts = [
    `${formatNumber(r.measured, "count")} measured`,
    `${formatNumber(r.awaiting, "count")} waiting for a result`,
    `best ${formatNumber(r.best)}`,
    `from ${r.fromSheet}`,
  ];
  return (
    <li>
      <Link href={`/data/round/${r.round}`} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 rounded-lg px-2 py-3 hover:bg-fill-hover">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-heading text-fg">Round {r.round}</span>
          <span className="text-caption tabular-nums text-fg-muted">{facts.join(DOT)}</span>
        </span>
        <Badge tone="neutral">{r.folded ? "Now part of the runs the model learns from" : r.awaiting > 0 ? "Waiting for a result" : "Measured"}</Badge>
      </Link>
    </li>
  );
}
