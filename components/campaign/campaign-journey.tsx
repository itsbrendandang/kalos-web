import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import type { CampaignStage } from "@/lib/campaign-stage";
import { cn } from "@/lib/utils";

/** A navigation summary, not a progress estimate: state comes from the engine's campaign loop. */
export function CampaignJourney({ stage }: { stage: CampaignStage }) {
  return (
    <section aria-label="Campaign journey" className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-label text-fg">The campaign loop</h2>
        <span className="text-caption text-fg-muted">{stage.round == null ? "Start with your data" : `Round ${stage.round}`}</span>
      </div>
      <ol className="grid grid-cols-[repeat(5,minmax(135px,1fr))] gap-2 overflow-x-auto pb-1">
        {stage.steps.map((step, index) => (
          <li key={step.key} className="min-w-0">
            <Link
              href={step.href}
              aria-label={`${step.label}, ${step.state}${step.detail ? `: ${step.detail}` : ""}`}
              className={cn(
                "flex h-full items-start gap-2 rounded-lg border px-2.5 py-3 transition-colors",
                step.state === "current" ? "border-accent/30 bg-accent-soft" : "border-transparent hover:bg-subtle",
              )}
            >
              <span className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums",
                step.state === "done" ? "border-accent bg-accent text-accent-fg" : step.state === "current" ? "border-accent text-accent" : "border-border-strong text-fg-muted",
              )}>
                {step.state === "done" ? <Check className="size-3.5" aria-hidden /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-label", step.state === "current" ? "text-accent" : "text-fg")}>{step.label}</span>
                <span className="mt-1 block text-[11px] leading-4 text-fg-muted">{step.state === "current" ? "In progress" : step.state === "done" ? "Complete" : "Up next"}</span>
                {step.detail ? <span className="mt-1 block text-[11px] leading-4 text-fg-muted">{step.detail}</span> : null}
              </span>
              {index < stage.steps.length - 1 ? <ChevronRight className="mt-1 hidden size-3 shrink-0 text-fg-muted xl:block" aria-hidden /> : null}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
