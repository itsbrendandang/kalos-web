"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { SopDraftDialog } from "@/components/assist/sop-draft-dialog";
import { PageHeader } from "@/components/kit/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listSops, sopExportHref } from "@/lib/api";
import { AssistUnavailableError } from "@/lib/assist";
import { formatDraftDate, sopSourceLabel, templateLabel, type SopSummary } from "@/lib/sop";

type Index = { status: "loading" } | { status: "error" } | { status: "absent" } | { status: "ready"; drafts: SopSummary[] };

/**
 * Documents: every procedure draft Kalos wrote from this campaign's records,
 * newest first, with its latest version, date, what it was written from and
 * a download. A draft is never an approved procedure; the header on each one
 * says so.
 */
export default function DocumentsPage() {
  const [index, setIndex] = useState<Index>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [draftOpen, setDraftOpen] = useState(false);

  useEffect(() => {
    let live = true;
    listSops().then(
      (drafts) => live && setIndex({ status: "ready", drafts }),
      (e: unknown) => live && setIndex({ status: e instanceof AssistUnavailableError && e.reason === "absent" ? "absent" : "error" }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  const refresh = useCallback(() => setAttempt((a) => a + 1), []);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Documents"
        description="Procedure drafts written from your records. Every version is kept, and none is an approved procedure until your lab reviews it."
        action={
          index.status === "ready" ? (
            <Button onClick={() => setDraftOpen(true)}>
              <FileText aria-hidden />
              Draft a procedure
            </Button>
          ) : null
        }
      />
      {index.status === "loading" ? (
        <LoadingSkeleton variant="table" rows={3} label="Loading the drafts" />
      ) : index.status === "error" ? (
        <ErrorState title="Could not reach Kalos" description="The drafts could not be loaded. This is a connection problem, not an empty list." onRetry={refresh} />
      ) : index.status === "absent" ? (
        <EmptyState icon={FileText} title="No procedure drafts here" description="This version of Kalos cannot write procedure drafts yet." />
      ) : index.drafts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No drafts yet"
          description="Draft a procedure from a recorded round, a proposed recipe or a run. Kalos fills in the numbers from your records and leaves the rest for your lab."
          action={<Button onClick={() => setDraftOpen(true)}>Draft a procedure</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Written from</TableHead>
              <TableHead numeric>Version</TableHead>
              <TableHead>Last changed</TableHead>
              <TableHead>Download</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {index.drafts.map((d) => (
              <TableRow key={d.draft_id}>
                <TableCell>
                  <Link href={`/documents/${encodeURIComponent(d.draft_id)}`} className="text-fg hover:text-accent hover:underline">
                    {d.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge>{templateLabel(d.template)}</Badge>
                </TableCell>
                <TableCell className="text-fg-muted">{d.source_ids?.length ? d.source_ids.map(sopSourceLabel).join(", ") : "Open the draft to see"}</TableCell>
                <TableCell numeric className="tabular-nums">
                  {d.latest_version}
                </TableCell>
                <TableCell className="text-fg-muted">{formatDraftDate(d.updated_at)}</TableCell>
                <TableCell>
                  <span className="flex gap-1">
                    <a href={sopExportHref(d.draft_id, "md")} download className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      .md
                    </a>
                    <a href={sopExportHref(d.draft_id, "docx")} download className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      .docx
                    </a>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <SopDraftDialog open={draftOpen} onOpenChange={setDraftOpen} />
    </div>
  );
}
