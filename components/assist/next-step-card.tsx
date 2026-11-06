"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { Verdict } from "@/components/kit/verdict";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNextStepCard } from "@/hooks/use-assist";
import { nextActionLabel, type AssistNext } from "@/lib/assist";
import { cn } from "@/lib/utils";
import { whyLine } from "@/lib/why";

/** The why-line for a next step the guide sent without one, keyed by the stage its button opens (the same lines as lib/agent.ts). */
function whyForRoute(route: string): string | null {
  const code = route.startsWith("/campaign/setup") ? "setup_no_sheet" : route.startsWith("/campaign/plan") ? "plan_ready" : route.startsWith("/campaign/run") ? "run_waiting" : route.startsWith("/campaign/record") ? "record_partial" : route.startsWith("/campaign/learn") ? "learn_ready" : null;
  return code ? whyLine(code) : null;
}

/**
 * "What to do next": one sentence with its "Why this matters" line directly
 * under it, one button to the stage page, and what stands in the way one
 * click down. The words come from the engine's guide,
 * or from the campaign itself on an engine without one (hooks/use-assist).
 */
export function NextStepCard({
  next,
  tone = "accent",
  aside,
  detail,
  className,
}: {
  next: AssistNext;
  tone?: "accent" | "good" | "warn" | "neutral";
  /** Something to sit beside the button, like the trust badge on Overview. */
  aside?: ReactNode;
  /** More for the Why disclosure, after the guide's own reasons (Overview adds the trust reading). */
  detail?: ReactNode;
  className?: string;
}) {
  const blocked = next.blockers.length > 0;
  return (
    <section aria-label="What to do next" className={cn("flex flex-col gap-4", className)}>
      <Verdict tone={blocked ? "warn" : tone} why={next.why_it_matters ?? whyForRoute(next.action_route)} detail={<Why next={next} extra={detail} />} detailLabel="Why">
        {next.step}
      </Verdict>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href={next.action_route} className={buttonVariants({ size: "lg" })}>
          {nextActionLabel(next)}
          <ArrowRight aria-hidden />
        </Link>
        {aside}
      </div>
    </section>
  );
}

function Why({ next, extra }: { next: AssistNext; extra?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {next.why ? <p>{next.why}</p> : null}
      {next.blockers.length > 0 ? <Blockers blockers={next.blockers} /> : null}
      {extra}
    </div>
  );
}

function Blockers({ blockers }: { blockers: AssistNext["blockers"] }) {
  const n = blockers.length;
  return (
    <Disclosure summary={n === 1 ? "One thing is in the way" : `${n} things are in the way`} className="border-t-0">
      <ul className="flex flex-col gap-2 text-body">
        {blockers.map((b, i) => (
          <li key={`${b.code}-${i}`} className="flex flex-col gap-0.5">
            <span className="text-fg">{b.text}</span>
            {b.why ? <span className="text-fg-muted">{b.why}</span> : null}
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

/** The card from the shared next-step state, with the honest loading shape. Renders nothing when there is nothing to say. */
export function NextStepFromEngine({ aside, className }: { aside?: ReactNode; className?: string }) {
  const { next, loading } = useNextStepCard();
  if (loading) {
    return (
      <div className={cn("flex flex-col gap-4", className)} role="status" aria-label="Working out the next step">
        <Skeleton className="h-6 w-full max-w-2xl" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
    );
  }
  if (!next) return null;
  return <NextStepCard next={next} aside={aside} className={className} />;
}

/**
 * The compact line at the foot of every stage page: the step in one sentence
 * and a link to it. Hidden on the stage page the step points to, so a page
 * never tells you to open itself.
 */
export function NextStepLine({ className }: { className?: string }) {
  const pathname = usePathname();
  const { next } = useNextStepCard();
  if (!next || next.action_route === pathname) return null;
  const [first, ...rest] = next.blockers;
  return (
    <aside aria-label="What to do next" className={cn("mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-body", className)}>
      <p className="min-w-0 flex-1 text-fg">
        <span className="text-fg-muted">Next: </span>
        {next.step}
        {first ? (
          <>
            {" "}
            <Link href={next.action_route} className="text-fg-muted underline-offset-4 hover:text-fg hover:underline">
              {first.text}
              {rest.length > 0 ? ` And ${rest.length} more.` : ""}
            </Link>
          </>
        ) : null}
      </p>
      <Link href={next.action_route} className={buttonVariants({ variant: "outline", size: "sm" })}>
        {nextActionLabel(next)}
        <ArrowRight aria-hidden />
      </Link>
    </aside>
  );
}
