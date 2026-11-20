"use client";

import { useState } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Disclosure } from "@/components/kit/disclosure";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateCampaign, type CampaignMeta } from "@/lib/api";
import { ARCHIVE_STEP_UP_SECONDS, archiveErrorCopy, type ArchiveErrorCopy } from "@/lib/home";

export type ArchiveRequest = { campaign: Pick<CampaignMeta, "id" | "name">; action: "archive" | "unarchive" };

/**
 * Archive or unarchive a campaign (PATCH /api/campaigns/{id} with `archived`), after a confirmation that says
 * what it does and who may do it: only organization admins, within a few minutes of verifying a second factor
 * (the web proxy checks both; lib/server/engine-proxy.ts). Archived campaigns stay readable, and the engine
 * refuses every write to them (409 campaign_archived).
 */
export function ArchiveDialog({ request, onOpenChange, onDone }: { request: ArchiveRequest | null; onOpenChange: (open: boolean) => void; onDone: () => void }) {
  return (
    <Dialog open={request != null} onOpenChange={onOpenChange}>
      <DialogContent>
        {request ? <ArchiveConfirm key={`${request.campaign.id}-${request.action}`} request={request} onClose={() => onOpenChange(false)} onDone={onDone} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ArchiveConfirm({ request, onClose, onDone }: { request: ArchiveRequest; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ArchiveErrorCopy | null>(null);
  const { campaign, action } = request;
  const archive = action === "archive";
  const minutes = Math.round(ARCHIVE_STEP_UP_SECONDS / 60);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await updateCampaign(campaign.id, { archived: archive });
      onDone();
      onClose();
    } catch (err) {
      setError(archiveErrorCopy(err, action));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          {archive ? "Archive" : "Unarchive"} {campaign.name}?
        </DialogTitle>
        <DialogDescription>
          {archive
            ? "The campaign leaves the campaign list and becomes read-only: it can still be opened and exported, but the engine refuses every change to it (uploads, runs, results, setup, gate decisions). Nothing is deleted."
            : "The campaign returns to the campaign list and can be changed again."}
        </DialogDescription>
      </DialogHeader>
      <p className="text-body text-fg-muted">
        Only organization admins can {action} campaigns, and only within {minutes} minutes of verifying their second factor.
        {archive ? " You can find it again under Archived campaigns on the home page, where an admin can unarchive it." : ""}
      </p>
      {error ? (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-bad-soft p-tight text-body text-fg">
          <p>{error.message}</p>
          {error.fix ? <p>{error.fix}</p> : null}
          {error.signOut ? (
            <div className="w-fit">
              <SignOutButton />
            </div>
          ) : null}
          {error.code ? (
            <Disclosure summary="Response details">
              <p className="text-caption text-fg-muted">
                Code: <span className="font-mono text-code text-fg">{error.code}</span>
              </p>
            </Disclosure>
          ) : null}
        </div>
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>Cancel</DialogClose>
        <Button type="button" variant={archive ? "destructive" : "default"} onClick={() => void confirm()} disabled={busy}>
          {busy ? (archive ? "Archiving..." : "Unarchiving...") : archive ? "Archive campaign" : "Unarchive campaign"}
        </Button>
      </DialogFooter>
    </div>
  );
}
