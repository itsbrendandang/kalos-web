"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { SopMarkdown } from "@/components/assist/sop-markdown";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Input } from "@/components/ui/input";
import { fillSop, getSop, reviseSop, RevisionRefusedError, sopExportHref } from "@/lib/api";
import { AssistUnavailableError } from "@/lib/assist";
import { EngineError } from "@/lib/engine-error";
import { checkFillValue, draftBody, draftHeader, formatDraftDate, openPlaceholders, placeholderLabel, placeholdersAgree, sopSourceHref, sopSourceLabel, templateLabel, type SopDraft } from "@/lib/sop";

type Loaded = { status: "loading" } | { status: "error" } | { status: "missing" } | { status: "ready"; draft: SopDraft; latest: number };

/**
 * One procedure draft, side by side: the rendered draft on the left, and on
 * the right the numbers taken from your records (each linking to its
 * source) and the things only your lab can fill in (each an input, saved as
 * a new version). Below the draft, a line to tell Kalos what to reword; a
 * refused revision shows its plain reason. The header line is always shown
 * and cannot be edited.
 */
export default function DocumentPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [state, setState] = useState<Loaded>({ status: "loading" });
  const [version, setVersion] = useState<number | undefined>(undefined);

  const load = useCallback(
    (v: number | undefined, latest?: number) =>
      getSop(id, v).then(
        (draft) => setState({ status: "ready", draft, latest: Math.max(latest ?? 0, draft.version) }),
        (e: unknown) => setState({ status: e instanceof EngineError && e.status === 404 ? "missing" : e instanceof AssistUnavailableError ? "missing" : "error" }),
      ),
    [id],
  );
  useEffect(() => {
    void load(version, state.status === "ready" ? state.latest : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read on id/version only; `latest` is carried, not a trigger
  }, [id, version]);

  /** A write returned the new version: show it and move the version list along. */
  const replace = (draft: SopDraft) => {
    setVersion(undefined);
    setState({ status: "ready", draft, latest: draft.version });
  };

  if (state.status === "loading") return <LoadingSkeleton rows={6} label="Loading the draft" />;
  if (state.status === "error") return <ErrorState title="Could not reach Kalos" description="The draft could not be loaded. This is a connection problem, not a missing draft." onRetry={() => void load(version)} />;
  if (state.status === "missing") return <EmptyState title="No such draft" description="The address does not name a draft Kalos holds." action={<BackToDocuments />} />;

  const { draft, latest } = state;
  const header = draftHeader(draft.markdown);
  const isLatest = draft.version === latest;
  const placeholders = placeholdersAgree(draft) ? draft.placeholders : openPlaceholders(draft.markdown).map((name) => ({ name, section: "", why: "" }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`${templateLabel(draft.template)} · version ${draft.version} of ${latest} · ${formatDraftDate(draft.created_at)}`}
        title={draft.title}
        description={draft.model ? `This version's wording was changed by the model (${draft.model}). The numbers were not.` : "Written from your records with no model involved."}
        action={
          <span className="flex flex-wrap items-center gap-2">
            {latest > 1 ? <VersionPicker current={draft.version} latest={latest} onPick={setVersion} /> : null}
            <a href={sopExportHref(draft.draft_id, "md", draft.version)} download className={buttonVariants({ variant: "outline", size: "sm" })}>
              Download .md
            </a>
            <a href={sopExportHref(draft.draft_id, "docx", draft.version)} download className={buttonVariants({ variant: "outline", size: "sm" })}>
              Download .docx
            </a>
          </span>
        }
      />

      {header ? (
        <Callout tone="neutral" icon={Lock} title={header}>
          This line stays on every version and every download. It cannot be edited.
        </Callout>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="flex min-w-0 flex-col gap-8">
          <article aria-label="The draft">
            <SopMarkdown markdown={draftBody(draft.markdown)} />
          </article>
          {isLatest ? <ReviseForm draftId={draft.draft_id} onRevised={replace} /> : <p className="text-body text-fg-muted">This is an earlier version. Open the latest one to change the wording or fill in a value.</p>}
        </div>

        <aside className="flex flex-col gap-8">
          <Section id="from-records" title="Numbers taken from your records" description={draft.fields_from_record.length ? "Each one links to where it came from. The model cannot change them." : "This draft quotes no numbers from your records."}>
            {draft.fields_from_record.length ? (
              <ul className="divide-y divide-border border-y border-border">
                {draft.fields_from_record.map((f, i) => {
                  const href = sopSourceHref(f.source_id);
                  const label = sopSourceLabel(f.source_id);
                  return (
                    <li key={`${f.source_id}-${f.field}-${i}`} className="flex flex-col gap-0.5 py-2.5">
                      <span className="text-caption text-fg-muted">{f.section ? `${f.section} · ` : ""}{f.field}</span>
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className="text-body tabular-nums text-fg">{f.value}</span>
                        {href ? (
                          <Link href={href} className="text-caption text-accent hover:underline">
                            {label}
                          </Link>
                        ) : (
                          <span className="text-caption text-fg-muted">{label}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Section>

          <Section id="to-fill" title="Things only your lab can fill in" description={placeholders.length ? "Type each value, then save. Every save is a new version." : "Everything is filled in."}>
            {placeholders.length ? isLatest ? <FillForm draftId={draft.draft_id} placeholders={placeholders} onFilled={replace} /> : <PlaceholderList names={placeholders.map((p) => p.name)} /> : null}
            {draft.filled?.length ? (
              <Disclosure summary="Filled in so far" meta={`${draft.filled.length}`} className="border-t-0">
                <ul className="flex flex-col gap-1.5 text-body">
                  {draft.filled.map((f) => (
                    <li key={f.name} className="flex flex-col">
                      <span className="text-caption text-fg-muted">{placeholderLabel(f.name)}</span>
                      <span className="text-fg">
                        {f.value} <span className="text-fg-muted">by {f.filled_by}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            ) : null}
          </Section>

          <Disclosure summary="Where this draft came from" className="border-t-0">
            <ul className="flex flex-col gap-1 text-body">
              {draft.source_ids.map((s) => {
                const href = sopSourceHref(s);
                return (
                  <li key={s}>
                    {href ? (
                      <Link href={href} className="text-accent hover:underline">
                        {sopSourceLabel(s)}
                      </Link>
                    ) : (
                      sopSourceLabel(s)
                    )}
                  </li>
                );
              })}
            </ul>
            {draft.sha256 ? (
              <p className="mt-2 text-caption text-fg-muted">
                Fingerprint of this version <span className="font-mono text-code">{draft.sha256.slice(0, 12)}</span>
              </p>
            ) : null}
          </Disclosure>
          <BackToDocuments />
        </aside>
      </div>
    </div>
  );
}

function BackToDocuments() {
  return (
    <Link href="/documents" className="flex w-fit items-center gap-1.5 text-label text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4" aria-hidden />
      All documents
    </Link>
  );
}

function VersionPicker({ current, latest, onPick }: { current: number; latest: number; onPick: (v: number | undefined) => void }) {
  const id = useId();
  return (
    <span className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-caption text-fg-muted">
        Version
      </label>
      <select
        id={id}
        value={current}
        onChange={(e) => onPick(Number(e.target.value) === latest ? undefined : Number(e.target.value))}
        className="h-8 rounded-lg border border-border-strong bg-surface px-2 text-label text-fg"
      >
        {Array.from({ length: latest }, (_, i) => latest - i).map((v) => (
          <option key={v} value={v}>
            {v === latest ? `${v} (latest)` : v}
          </option>
        ))}
      </select>
    </span>
  );
}

function ReviseForm({ draftId, onRevised }: { draftId: string; onRevised: (d: SopDraft) => void }) {
  const id = useId();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setRefused(null);
    setFailed(null);
    try {
      onRevised(await reviseSop(draftId, text));
      setInstruction("");
    } catch (err) {
      if (err instanceof RevisionRefusedError) setRefused(err.reasons.length ? err.reasons : ["That would change something taken from your records."]);
      else if (err instanceof AssistUnavailableError) setFailed(err.reason === "unavailable" ? "The model did not answer. Check that it is running, then try again." : "The assistant is off, so the wording cannot be changed. The values on the right can still be filled in.");
      else setFailed("Kalos could not be reached, so nothing was changed. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2 border-t border-border pt-5">
      <label htmlFor={id} className="text-label text-fg">
        Tell Kalos what to change in the wording
      </label>
      <div className="flex items-center gap-2">
        <Input id={id} value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={2000} placeholder="For example: make the safety step come first" disabled={busy} />
        <Button type="submit" disabled={busy || !instruction.trim()}>
          {busy ? "Changing..." : "Change the wording"}
        </Button>
      </div>
      <p className="text-caption text-fg-muted">The model may reword steps. Kalos checks that numbers from your records are unchanged, that your blanks stay blank and that the header line is untouched; a change that fails a check is not kept. Read the draft before you use it.</p>
      {refused ? (
        <div role="alert" className="flex flex-col gap-1 text-body text-fg">
          <p>Kalos did not keep that change. {refused.length === 1 ? refused[0] : ""}</p>
          {refused.length > 1 ? (
            <ul className="list-disc pl-5">
              {refused.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {failed ? (
        <p role="alert" className="text-body text-fg">
          {failed}
        </p>
      ) : null}
    </form>
  );
}

function PlaceholderList({ names }: { names: string[] }) {
  return (
    <ul className="flex flex-col gap-1 text-body text-fg">
      {names.map((n) => (
        <li key={n}>{placeholderLabel(n)}</li>
      ))}
    </ul>
  );
}

function FillForm({ draftId, placeholders, onFilled }: { draftId: string; placeholders: { name: string; section: string; why: string }[]; onFilled: (d: SopDraft) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const baseId = useId();
  const entries = placeholders.map((p) => ({ ...p, value: values[p.name] ?? "", problem: values[p.name] ? checkFillValue(values[p.name]) : null }));
  const ready = entries.filter((e) => e.value.trim() && !e.problem);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready.length || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      onFilled(await fillSop(draftId, Object.fromEntries(ready.map((r) => [r.name, r.value.trim()]))));
      setValues({});
    } catch {
      setFailed("The values were not saved. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      {entries.map((p) => {
        const id = `${baseId}-${p.name}`;
        return (
          <div key={p.name} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-label text-fg">
              {placeholderLabel(p.name)}
              {p.section ? <span className="text-caption font-normal text-fg-muted"> · {p.section}</span> : null}
            </label>
            <Input id={id} value={p.value} onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))} maxLength={500} aria-invalid={p.problem ? true : undefined} aria-describedby={p.why ? `${id}-why` : undefined} />
            {p.problem ? (
              <p className="text-caption text-bad">{p.problem}</p>
            ) : p.why ? (
              <p id={`${id}-why`} className="text-caption text-fg-muted">
                {p.why}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={busy || !ready.length}>
          {busy ? "Saving..." : ready.length ? `Save ${ready.length === 1 ? "this value" : `these ${ready.length} values`} as a new version` : "Save as a new version"}
        </Button>
        {failed ? (
          <p role="alert" className="text-body text-fg">
            {failed}
          </p>
        ) : null}
      </div>
    </form>
  );
}
