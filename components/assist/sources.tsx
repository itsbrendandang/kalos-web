import Link from "next/link";
import { Disclosure } from "@/components/kit/disclosure";
import { Badge } from "@/components/ui/badge";
import { numberLabel, sourceHref, sourceLabel, type AssistSource } from "@/lib/assist";
import { cn } from "@/lib/utils";

const CHIP = "inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-border-strong px-2 text-caption text-fg-muted";

/**
 * Where an answer came from: one small chip per source, linking to the sheet,
 * round, finding or model results it was quoted from. The quotes themselves
 * sit one click down, each with its Measured or Predicted label kept.
 */
export function Sources({ sources, className }: { sources: AssistSource[]; className?: string }) {
  if (sources.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <ul aria-label="Sources" className="flex flex-wrap gap-1.5">
        {sources.map((s, i) => {
          const href = sourceHref(s);
          const label = sourceLabel(s);
          return (
            <li key={`${s.kind}-${s.id}-${i}`} className="min-w-0">
              {href ? (
                <Link href={href} title={s.quote} className={cn(CHIP, "hover:border-accent hover:text-accent")}>
                  <span className="truncate">{label}</span>
                </Link>
              ) : (
                <span title={s.quote} className={CHIP}>
                  <span className="truncate">{label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <Disclosure summary="What was quoted" className="border-t-0">
        <ul className="flex flex-col gap-2 text-body">
          {sources.map((s, i) => (
            <li key={`${s.kind}-${s.id}-q-${i}`} className="flex flex-col gap-1">
              <span className="text-caption text-fg-muted">{sourceLabel(s)}</span>
              <Quote text={s.quote} />
            </li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}

/** A verbatim quote. A number in it keeps the word that says what it is. */
export function Quote({ text, className }: { text: string; className?: string }) {
  const label = numberLabel(text);
  return (
    <p className={cn("flex flex-wrap items-start gap-x-2 gap-y-1 text-fg", className)}>
      <q className="min-w-0 whitespace-pre-wrap">{text}</q>
      {label ? (
        <Badge tone={label === "Measured" ? "neutral" : "accent"} variant="outline">
          {label}
        </Badge>
      ) : null}
    </p>
  );
}
