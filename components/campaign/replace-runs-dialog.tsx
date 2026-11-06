"use client";

import { useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CampaignHasRunsError } from "@/lib/api";

/**
 * Asks before an upload replaces a campaign that still has awaiting or
 * measured runs. Open while `refusal` is set. Cancel (button, Escape, or the
 * close X) calls `onCancel` and changes nothing; only `onConfirm` resends the
 * file with replace=true. Focus starts on Cancel, the safe choice.
 */
export function ReplaceRunsDialog({
  refusal,
  onConfirm,
  onCancel,
}: {
  refusal: CampaignHasRunsError | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { awaiting, measured } = refusal ?? { awaiting: null, measured: null };
  const description =
    awaiting !== null && measured !== null
      ? `This replaces ${awaiting} ${awaiting === 1 ? "run" : "runs"} waiting for a result and ${measured} measured ${measured === 1 ? "run" : "runs"} in this campaign. Export them first, or go on and lose them.`
      : "This replaces the runs waiting for a result and the measured runs in this campaign. Export them first, or go on and lose them.";

  return (
    <Dialog open={refusal !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent initialFocus={cancelRef}>
        <DialogHeader>
          <DialogTitle>Replace this campaign&apos;s runs?</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelRef} variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Replace the runs and upload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
