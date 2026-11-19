"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCampaigns } from "@/hooks/use-engine";
import { createCampaign } from "@/lib/api";
import { NAME_MAX, nameErrorMessage, validateCampaignName } from "@/lib/home";
import { campaignHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Name a campaign and create it (POST /api/campaigns), then go straight to
 * Harmonize to bring the prior runs. The name rule is checked here first and
 * the engine's own refusal is shown if it still says no.
 */
export function NewCampaignForm({
  autoFocus = false,
  focusKey,
  label = "Campaign name",
  submitLabel = "Start a campaign",
  className,
}: {
  autoFocus?: boolean;
  /** Changing this re-focuses the field (e.g. the sidebar's "New campaign" while already on this page). */
  focusKey?: string | number;
  label?: string;
  submitLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const campaigns = useCampaigns();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus, focusKey]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validateCampaignName(name);
    if (!check.ok) {
      setError(check.message);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createCampaign(check.name);
      void campaigns.refresh();
      router.push(campaignHref(created.id, "harmonize"));
    } catch (err) {
      setError(nameErrorMessage(err));
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <form onSubmit={submit} noValidate className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-label text-fg">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={inputRef}
          id={id}
          name="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. CHO fed-batch titer, line 4"
          autoComplete="off"
          maxLength={NAME_MAX * 2}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint`}
          disabled={busy}
          className="sm:max-w-sm"
        />
        <Button type="submit" disabled={busy} className="sm:self-start">
          {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {busy ? "Creating..." : submitLabel}
          {busy ? null : <ArrowRight aria-hidden />}
        </Button>
      </div>
      <p id={`${id}-hint`} role={error ? "alert" : undefined} className={cn("text-caption", error ? "text-bad" : "text-fg-muted")}>
        {error ?? `Up to ${NAME_MAX} characters. You can rename it later.`}
      </p>
    </form>
  );
}
