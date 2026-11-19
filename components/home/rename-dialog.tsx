"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { updateCampaign, type CampaignMeta } from "@/lib/api";
import { NAME_MAX, nameErrorMessage, validateCampaignName } from "@/lib/home";
import { cn } from "@/lib/utils";

/** Rename a campaign (PATCH /api/campaigns/{id} with a new name). Nothing else about the campaign changes. */
export function RenameDialog({
  campaign,
  onOpenChange,
  onRenamed,
}: {
  campaign: CampaignMeta | null;
  onOpenChange: (open: boolean) => void;
  onRenamed: (c: CampaignMeta) => void;
}) {
  return (
    <Dialog open={campaign != null} onOpenChange={onOpenChange}>
      <DialogContent>
        {campaign ? <RenameForm key={campaign.id} campaign={campaign} onDone={() => onOpenChange(false)} onRenamed={onRenamed} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ campaign, onDone, onRenamed }: { campaign: CampaignMeta; onDone: () => void; onRenamed: (c: CampaignMeta) => void }) {
  const id = useId();
  const [name, setName] = useState(campaign.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validateCampaignName(name);
    if (!check.ok) return setError(check.message);
    if (check.name === campaign.name) return onDone();
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCampaign(campaign.id, { name: check.name });
      onRenamed(updated);
      onDone();
    } catch (err) {
      setError(nameErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Rename campaign</DialogTitle>
        <DialogDescription>Only the name changes. Runs, results and analyses stay as they are.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-label text-fg">
          Name
        </label>
        <Input
          id={id}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint`}
          disabled={busy}
        />
        <p id={`${id}-hint`} role={error ? "alert" : undefined} className={cn("text-caption", error ? "text-bad" : "text-fg-muted")}>
          {error ?? `Up to ${NAME_MAX} characters.`}
        </p>
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>Cancel</DialogClose>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save name"}
        </Button>
      </DialogFooter>
    </form>
  );
}
