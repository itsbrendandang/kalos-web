"use client";

// One run sheet this browser has loaded: its rows, its charts, and how the engine read it when the engine's
// current analysis came from the same bytes (joined on `run.input_sha256`). Everything about the rows is read
// from the stored file here; the engine only adds the target, its input list, the column roles and the runs
// the campaign measured since the upload.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { leadSentence } from "@/components/campaign/data/meaning";
import { YourDataView } from "@/components/campaign/data/your-data";
import { useSheetProfile, type SheetProfileState } from "@/components/campaign/data/use-sheet-profile";
import { ColumnRoles } from "@/components/data/column-roles";
import { DataTable } from "@/components/data/data-table";
import { tableRows, withExtraRows, type ExtraRow } from "@/components/data/rows";
import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Verdict } from "@/components/kit/verdict";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { displayRound } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";
import { forgetSheet, useStoredSheet } from "@/lib/sheet-store";

export const KEPT_HERE = "This sheet is kept in this browser only, so the rows can be shown without sending them anywhere again. Forget it to remove the copy. The engine keeps its own copy for the campaign.";

const DATE = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

/** The header sentence: counts, target, when it was loaded, and whether the engine is working from it. */
export function sheetDescription(f: { n: number | null; d: number | null; target: string | null; loadedAt: number; inUse: boolean }): string {
  const parts: string[] = [];
  if (f.n != null) parts.push(`${formatNumber(f.n, "count")} ${f.n === 1 ? "row" : "rows"}`);
  if (f.d != null) parts.push(`${formatNumber(f.d, "count")} ${f.d === 1 ? "input" : "inputs"}`);
  if (f.target) parts.push(`target ${f.target}`);
  const facts = parts.length ? `${parts.join(", ")}. ` : "";
  return `${facts}Loaded ${DATE.format(new Date(f.loadedAt))}. ${f.inUse ? "In use by the campaign." : "Not in use by the campaign."}`;
}

/** The runs the campaign measured since this sheet was uploaded, as table rows labelled with their round. */
export function roundRows(pending: readonly { recipe: Record<string, number>; result: number | null; round?: number }[], target: string, currentRound: number): ExtraRow[] {
  return pending
    .filter((r) => r.result != null)
    .map((r) => ({ values: { ...r.recipe, [target]: r.result }, origin: `Round ${displayRound(r.round ?? currentRound)}` }));
}

export function SheetPage({ sha }: { sha: string }) {
  const router = useRouter();
  const stored = useStoredSheet(sha);
  const latest = useLatest();
  const campaign = useCampaign();
  const [forgetting, setForgetting] = useState(false);

  const file = stored.status === "ready" ? stored.file : null;
  const worksheet = stored.status === "ready" ? stored.sheet.worksheet ?? undefined : undefined;
  const profileState = useSheetProfile(file, worksheet);

  const analysis = latest.data?.has_data ? latest.data : null;
  const inUse = analysis?.run?.input_sha256 === sha;
  const live = inUse ? analysis : null;
  const facts = stored.status === "ready" ? stored.sheet.engine : null;
  const target = live?.target ?? facts?.target ?? undefined;
  const engineInputs = live?.features ?? facts?.features ?? undefined;
  const summary = campaign.data?.has_campaign ? campaign.data : null;

  const extra = useMemo(() => (inUse && summary && target ? roundRows(summary.pending, target, summary.round) : []), [inUse, summary, target]);
  const profile = profileState?.status === "ready" ? profileState.profile : null;
  const table = useMemo(() => (profile ? tableRows(profile, target, { engineInputs, extra }) : null), [profile, target, engineInputs, extra]);
  // The charts see the sheet plus the campaign's measured runs, each run labelled with its round.
  const charted = useMemo(() => (profile ? withExtraRows(profile, extra) : null), [profile, extra]);
  const chartState: SheetProfileState | null =
    charted && profileState?.status === "ready" ? { status: "ready", profile: charted.profile, sheetUsed: profileState.sheetUsed } : profileState;

  if (stored.status === "loading") {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Data" title="Sheet" description="Reading the stored sheet." />
        <LoadingSkeleton rows={4} label="Loading the sheet" />
      </div>
    );
  }
  if (stored.status === "missing") {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Data" title="Sheet" description="No stored sheet has this id." />
        <EmptyState
          icon={Upload}
          title="This sheet is not held in this browser"
          description="Rows are kept only in the browser that uploaded the sheet. Upload the file again in Setup to see them here."
          action={
            <Link href="/campaign/setup" className={buttonVariants({})}>
              Upload a run sheet
            </Link>
          }
        />
      </div>
    );
  }

  const { sheet } = stored;
  const n = profile ? profile.n + extra.length : facts?.n ?? null;
  const d = engineInputs ? engineInputs.length : profile ? table!.columns.filter((c) => c.role === "input").length : null;
  const unreadable = profileState?.status === "unreadable";

  // One sentence of meaning for the whole sheet: the input that moved most with the target, from the rows themselves.
  const inputs = engineInputs ?? (charted ? charted.profile.columns.filter((c) => c.name !== target && (c.kind === "numeric" || c.kind === "category")).map((c) => c.name) : []);
  const lead = charted && target ? leadSentence(charted.profile, target, inputs) : null;
  const verdict = !target
    ? "The engine has not named a target for this sheet yet."
    : (lead ?? (n != null ? `${formatNumber(n, "count")} ${n === 1 ? "row" : "rows"} with ${target}; too few, or too alike, to say which input moved with it.` : `Target ${target}.`));

  const forget = async () => {
    setForgetting(true);
    await forgetSheet(sha);
    router.push("/data");
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Data"
        title={sheet.name}
        description={sheetDescription({ n, d, target: target ?? null, loadedAt: sheet.addedAt, inUse })}
        action={
          <Button variant="ghost" onClick={() => void forget()} disabled={forgetting}>
            {forgetting ? "Forgetting…" : "Forget this sheet"}
          </Button>
        }
      />

      <Verdict tone="neutral">{verdict}</Verdict>

      <YourDataView name={sheet.name} state={chartState} target={target} engineRuns={live?.n ?? null} engineInputs={engineInputs} rowOrigins={charted?.origins} hideFacts title="Inputs" targetFirst />

      <Section
        title="Rows"
        description={
          extra.length
            ? `Every row of the file, then the ${formatNumber(extra.length, "count")} ${extra.length === 1 ? "run" : "runs"} the campaign measured since, each labelled with its round.`
            : "Every row of the file, read in this browser. Sort by a column, filter by any value, or pick one level."
        }
      >
        {table && target ? (
          <DataTable columns={table.columns} rows={table.rows} target={target} />
        ) : table ? (
          <DataTable columns={table.columns} rows={table.rows} target="" />
        ) : unreadable ? (
          <p className="text-body text-fg-muted">
            {profileState.reason === "too-large" ? "This file is over 5 MB, so it was not read in the browser and its rows cannot be shown here." : "This file could not be read in the browser, so its rows cannot be shown here."}
          </p>
        ) : (
          <LoadingSkeleton variant="table" rows={5} label="Reading the rows" />
        )}
      </Section>

      {live ? <ColumnRoles provenance={live.provenance} droppedIncomplete={live.n_dropped_incomplete} /> : null}

      <Disclosure summary="Where this is kept">
        <p className="text-body text-fg-muted">{KEPT_HERE}</p>
      </Disclosure>
    </div>
  );
}
