"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatTimestamp } from "@/components/kit/source-line";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/honest-state";
import { Skeleton } from "@/components/ui/skeleton";
import { listAllCampaignSummaries, type CampaignSummaryRow } from "@/lib/api";
import { errorMessage } from "@/lib/engine-error";
import { sortCampaigns } from "@/lib/home";
import { campaignHref } from "@/lib/routes";

/**
 * The archived campaigns, read from the same summary list with archived ones included
 * (GET /api/campaigns?summary=true&include_archived=true, every page through next_cursor), mounted only when the user opens
 * "Archived campaigns". Each can be opened read-only or unarchived (an admin action, see ArchiveDialog).
 * `version` changes after an archive or unarchive so the list reloads.
 */
export function ArchivedCampaigns({ version, onUnarchive }: { version: number; onUnarchive: (c: CampaignSummaryRow) => void }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "data"; list: CampaignSummaryRow[]; more: boolean }>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    listAllCampaignSummaries({ includeArchived: true, limit: 200 }).then(
      (d) => !cancelled && setState({ status: "data", list: sortCampaigns(d.campaigns.filter((c) => c.archived)), more: !d.complete }),
      (err) => !cancelled && setState({ status: "error", message: errorMessage(err).message }),
    );
    return () => {
      cancelled = true;
    };
  }, [version, attempt]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading archived campaigns">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    );
  }
  if (state.status === "error") return <ErrorState description={`${state.message} Archived campaigns are unaffected.`} onRetry={retry} />;
  if (state.list.length === 0) return <p className="text-body text-fg-muted">No archived campaigns.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {state.list.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 p-tight sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link href={campaignHref(c.id)} className="text-label break-words text-fg hover:text-accent">
                {c.name}
              </Link>
              <p className="text-caption text-fg-muted">
                Archived {c.archived_at != null ? formatTimestamp(c.archived_at) : "(time not reported)"} · read-only
                {c.target ? (
                  <>
                    {" · "}
                    <span className="font-mono text-code">{c.target}</span>
                  </>
                ) : null}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onUnarchive(c)} className="self-start sm:self-center">
              Unarchive…
            </Button>
          </li>
        ))}
      </ul>
      {state.more ? <p className="text-caption text-fg-muted">Showing the archived campaigns among the pages read; the engine has more campaigns, and archived ones beyond those are not listed here.</p> : null}
    </div>
  );
}
