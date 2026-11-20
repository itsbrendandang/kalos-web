"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { formatTimestamp } from "@/components/kit/source-line";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { getSetup, putSetup, type AnalyzeResult, type SetupView } from "@/lib/api";
import { formatValue } from "@/lib/num";
import { campaignHref } from "@/lib/routes";
import { SetupForm } from "@/components/setup/setup-form";
import { AppliedSetupView, SetupError } from "@/components/setup/setup-outcome";
import {
  buildSetupDoc,
  draftFromSetup,
  sameSetup,
  setupErrorCopy,
  setupSync,
  type DraftIssue,
  type SetupDraft,
  type SetupErrorCopy,
  type SetupInput,
} from "@/components/setup/setup-logic";

type SetupAnalysis = Pick<AnalyzeResult, "features" | "categorical_features" | "feature_ranges" | "setup" | "target">;

/** The continuous inputs of an analysis with the engine's observed / effective ranges. Pure, exported for tests. */
export function setupInputsFromAnalysis(analysis: SetupAnalysis, view: Pick<SetupView, "bounds_report"> | null): SetupInput[] {
  const cats = new Set(analysis.categorical_features ?? []);
  return (analysis.features ?? [])
    .filter((f) => !cats.has(f))
    .map((name) => {
      const r = view?.bounds_report?.[name];
      const range = analysis.feature_ranges?.[name];
      return {
        name,
        observed: r?.observed ?? (range ? [range[0], range[1]] : null),
        effective: r?.effective ?? null,
        extrapolates: r?.extrapolates ?? null,
      };
    });
}

/**
 * The campaign setup on a seeded campaign: how it was applied to the current analysis, and the same form as
 * the first run to change it (GET /setup, PUT /setup). A changed setup applies on the next re-analysis or
 * upload, never silently; when the analysis predates it, the page says so and links to the re-analysis
 * (which needs at least one measured result). Archived campaigns are read-only.
 */
export function SetupSection({
  campaignId,
  analysis,
  archived,
  nMeasured,
}: {
  campaignId: string;
  analysis: SetupAnalysis;
  archived: boolean;
  /** Measured results not yet folded in (campaign summary `n_measured`); null when unknown. */
  nMeasured: number | null;
}) {
  const [view, setView] = useState<{ status: "loading" } | { status: "error"; copy: SetupErrorCopy } | { status: "data"; view: SetupView }>({ status: "loading" });
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SetupErrorCopy | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getSetup(campaignId).then(
      (v) => {
        if (cancelled) return;
        setView({ status: "data", view: v });
        setDraft(draftFromSetup(v.setup));
      },
      (err) => !cancelled && setView({ status: "error", copy: setupErrorCopy(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [campaignId, attempt]);

  const current = view.status === "data" ? view.view : null;
  const inputs = useMemo(() => setupInputsFromAnalysis(analysis, current), [analysis, current]);
  const categoricals = analysis.categorical_features ?? [];
  const retry = useCallback(() => {
    setView({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft || !current) return;
    setError(null);
    setSaved(false);
    const built = buildSetupDoc(draft, inputs);
    if (!built.ok) {
      setIssues(built.issues);
      setNotes([]);
      return;
    }
    setIssues([]);
    setNotes(built.notes);
    if (sameSetup(built.doc, current.setup)) {
      setSaved(true);
      return;
    }
    setSaving(true);
    try {
      const v = await putSetup(campaignId, built.doc);
      setView({ status: "data", view: v });
      setDraft(draftFromSetup(v.setup));
      setSaved(true);
    } catch (err) {
      setError(setupErrorCopy(err));
    } finally {
      setSaving(false);
    }
  }

  const sync = current ? setupSync(current, nMeasured) : null;
  const count = (n: number) => formatValue(n, { quantity: "count" }).text;

  return (
    <Section
      id="setup"
      title="Campaign setup"
      description="The goal, the target unit, and any bounds and linear constraints the proposals must respect. A change applies at the next re-analysis or upload."
    >
      <AppliedSetupView setup={analysis.setup} />

      {view.status === "loading" ? (
        <LoadingSkeleton variant="rows" rows={3} label="Loading the campaign setup" />
      ) : view.status === "error" ? (
        <ErrorState description={`${view.copy.message} The setup itself is unaffected.`} onRetry={retry} />
      ) : current && draft ? (
        <>
          {current.source === "unreadable" ? (
            <Callout tone="warn" title="The stored setup could not be read">
              The engine could not read this campaign&apos;s stored setup, so analyses refuse it. Save the setup again to replace it.
            </Callout>
          ) : sync?.kind === "reanalyze" ? (
            <Callout
              tone="warn"
              title="The setup changed after the current analysis"
              action={
                <Link href={`${campaignHref(campaignId, "validate")}#reanalyze`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                  Re-analyze on Validate
                  <ArrowRight aria-hidden />
                </Link>
              }
            >
              The proposals on Predict still use the earlier setup. Re-analyze to apply this one: the re-analysis also folds in the {count(nMeasured ?? 0)} measured{" "}
              {nMeasured === 1 ? "result" : "results"} waiting.
            </Callout>
          ) : sync?.kind === "reupload" ? (
            <Callout tone="warn" title="The setup changed after the current analysis">
              The proposals on Predict still use the earlier setup. A re-analysis needs at least one measured result and this campaign has none yet, so this setup
              applies when you upload the sheet again (Replace the data, below) or after you record a result and re-analyze.
            </Callout>
          ) : sync?.kind === "in-sync" ? (
            <p className="text-caption text-fg-muted">The current analysis used this setup.</p>
          ) : null}

          <p className="text-caption text-fg-muted">
            {current.source === "stored"
              ? `Saved${current.updated_by ? ` by ${current.updated_by}` : ""}${current.updated_at ? ` on ${formatTimestamp(current.updated_at)}` : ""}.`
              : current.source === "default"
                ? "Nothing saved yet: the defaults apply (maximize, no bounds, no constraints, unit from the column header)."
                : null}
            {archived ? " This campaign is archived, so its setup is read-only." : ""}
          </p>

          <Disclosure summary={archived ? "The stored setup" : "Edit the setup"} defaultOpen={!archived && (analysis.setup?.status === "refused" || sync?.kind === "reanalyze" || sync?.kind === "reupload")}>
            <form onSubmit={submit} noValidate className="flex flex-col gap-6 pt-2">
              <SetupForm
                value={draft}
                onChange={(d) => {
                  setDraft(d);
                  setSaved(false);
                  if (issues.length) setIssues([]);
                }}
                inputs={inputs}
                categoricals={categoricals}
                observedFrom="engine"
                issues={issues}
                disabled={archived || saving}
                targetName={analysis.target ?? null}
              />
              {error ? <SetupError copy={error} /> : null}
              {notes.length ? (
                <ul className="flex flex-col gap-1 text-caption text-fg-muted">
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
              {archived ? null : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                    {saving ? "Saving..." : "Save the setup"}
                  </Button>
                  {saved ? (
                    <span role="status" className="text-caption text-fg-muted">
                      Saved.{" "}
                      {setupSync(current, nMeasured).kind === "in-sync" ? "It matches the current analysis." : "It applies at the next re-analysis or upload."}
                    </span>
                  ) : null}
                </div>
              )}
            </form>
          </Disclosure>
        </>
      ) : null}
    </Section>
  );
}
