"use client";

import { PageHeader } from "@/components/kit/page-header";
import { Badge, ExampleBadge, ModeBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCampaign } from "@/hooks/use-engine";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { campaignView, shortId } from "@/lib/workbench";

// Interim Run stage: a plain read-only list of this round's runs, until the
// page is rebuilt to the Runs table spec. Rows carry id="run-<id>" for the
// explorer's links.
export default function RunPage() {
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Runs in flight" description="This round's runs, their recipes and predictions." meta={view.state === "data" && view.demo ? <ExampleBadge /> : null} />
      {view.state === "error" ? (
        <ErrorState onRetry={() => void campaign.refresh()} busy={campaign.refreshing} />
      ) : view.state === "loading" ? (
        <LoadingSkeleton variant="table" rows={4} />
      ) : view.state === "none" || view.campaign.pending.length === 0 ? (
        <EmptyState title="No runs started this round" description="Start runs from the Plan stage." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Run</TableHead>
              <TableHead>Recipe</TableHead>
              <TableHead numeric>Predicted</TableHead>
              <TableHead numeric>Measured</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.campaign.pending.map((r) => (
              <TableRow key={r.id} id={`run-${r.id}`} className="scroll-mt-12">
                <TableCell className="font-mono text-code">{shortId(r.id)}</TableCell>
                <TableCell className="whitespace-normal text-fg-muted">
                  {Object.entries(r.recipe).map(([k, v]) => (
                    <span key={k} className="mr-3 inline-block">
                      {k} <span className="text-fg tabular-nums">{formatNumber(v)}</span>
                    </span>
                  ))}
                </TableCell>
                <TableCell numeric>{formatNumber(r.pred)}</TableCell>
                <TableCell numeric>{formatNumber(r.result)}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Badge tone={r.awaiting ? "warn" : "good"}>{r.awaiting ? "Awaiting" : "Measured"}</Badge>
                    <ModeBadge mode={r.mode} />
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
