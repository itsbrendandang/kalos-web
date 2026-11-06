"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNextStepCard } from "@/hooks/use-assist";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { draftSop, listCampaigns } from "@/lib/api";
import { AssistUnavailableError } from "@/lib/assist";
import { displayRound } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";
import { SOP_TEMPLATES, type SopSource, type SopTemplate } from "@/lib/sop";
import { shortId } from "@/lib/workbench";
import { cn } from "@/lib/utils";

export type DraftPrefill = { round?: number; proposal?: number };

type SourceOption = { value: string; label: string; source: SopSource };

/**
 * "Draft a procedure": pick what the draft is written from (a round, a
 * proposed recipe, or a run) and a template; the engine writes version 1
 * from the records alone and the draft opens in Documents.
 */
export function SopDraftDialog({ open, onOpenChange, prefill }: { open: boolean; onOpenChange: (open: boolean) => void; prefill?: DraftPrefill | null }) {
  const router = useRouter();
  const latest = useLatest();
  const campaign = useCampaign();
  const guide = useNextStepCard();
  const sourceId = useId();
  // The user's pick, or null for the one the question named ("write an SOP for round 2"), else the first option.
  const [picked, setPicked] = useState<string | null>(null);
  const [template, setTemplate] = useState<SopTemplate>("batch_recipe");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const active = campaign.data?.has_campaign ? campaign.data : null;
  const analysis = latest.data?.has_data ? latest.data : null;
  const options: SourceOption[] = [
    ...(active?.history ?? []).filter((h) => h.round >= 1).map((h) => ({ value: `round:${h.round}`, label: `Round ${h.round}, as recorded`, source: { round: h.round } })),
    ...(analysis?.proposals ?? []).map((p, i) => ({
      value: `proposal:${i}`,
      label: `Recipe ${i + 1} of round ${active ? displayRound(active.round) : 1}, proposed (predicted ${formatNumber(p.pred)})`,
      source: { proposal_index: [i] },
    })),
    ...(active?.pending ?? []).map((r) => ({ value: `run:${r.id}`, label: `Run ${shortId(r.id)}${r.awaiting ? ", in the lab" : ", recorded"}`, source: { run_ids: [r.id] } })),
  ];

  const wanted = prefill?.round != null ? `round:${prefill.round}` : prefill?.proposal != null ? `proposal:${prefill.proposal}` : null;
  const source = picked ?? (wanted && options.some((o) => o.value === wanted) ? wanted : options[0]?.value) ?? "";
  const close = (next: boolean) => {
    if (!next) {
      setPicked(null);
      setFailed(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    const chosen = options.find((o) => o.value === source);
    if (!chosen) return;
    setBusy(true);
    setFailed(null);
    try {
      const campaign_id = guide.next?.campaign_id ?? (await listCampaigns().then((cs) => cs.find((c) => c.is_default)?.id, () => undefined));
      const draft = await draftSop({ ...(campaign_id ? { campaign_id } : {}), source: chosen.source, template });
      close(false);
      router.push(`/documents/${encodeURIComponent(draft.draft_id)}`);
    } catch (e) {
      setFailed(e instanceof AssistUnavailableError && e.reason === "absent" ? "This version of Kalos cannot write procedure drafts yet." : "The draft could not be written. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft a procedure</DialogTitle>
          <DialogDescription>Kalos writes the draft from your records. Every number in it comes from a run, a recipe or a round, and what only your lab knows is left for you to fill in.</DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-body text-fg-muted">There is nothing to write from yet. A draft needs a recorded round, a proposed recipe or a run.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={sourceId} className="text-label text-fg">
                Written from
              </label>
              <select
                id={sourceId}
                value={source}
                onChange={(e) => setPicked(e.target.value)}
                className="h-9 w-full rounded-lg border border-border-strong bg-surface px-3 text-body text-fg focus-visible:border-accent"
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-label text-fg">Template</legend>
              {SOP_TEMPLATES.map((t) => (
                <label
                  key={t.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5",
                    template === t.value ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:bg-subtle",
                  )}
                >
                  <input type="radio" name="template" value={t.value} checked={template === t.value} onChange={() => setTemplate(t.value)} className="mt-1 accent-[var(--accent)]" />
                  <span className="flex flex-col">
                    <span className="text-label text-fg">{t.label}</span>
                    <span className="text-caption text-fg-muted">{t.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {failed ? (
              <p role="alert" className="text-body text-fg">
                {failed}
              </p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || options.length === 0 || !source}>
            {busy ? "Writing the draft..." : "Write the draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
