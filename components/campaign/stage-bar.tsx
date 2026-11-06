"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StepDot } from "@/components/campaign/step-dot";
import { useCampaignStage } from "@/hooks/use-campaign-stage";
import { EXPERIMENTS_ROUTE } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Shown above every stage page: a way back to the five-stages page (named by its route label) and the five stages as one row. */
export function StageBar() {
  const pathname = usePathname();
  const { stage } = useCampaignStage();
  return (
    <nav aria-label="The five stages" className="mb-6 flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border pb-3">
      <Link href="/experiments" className="mr-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-label text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        {EXPERIMENTS_ROUTE.label}
      </Link>
      {stage?.steps.map((s) => {
        const here = pathname === s.href;
        return (
          <Link
            key={s.key}
            href={s.href}
            aria-current={here ? "page" : undefined}
            aria-label={`${s.label}, ${s.state === "upcoming" ? "coming up" : s.state === "current" ? "you are here" : "done"}`}
            className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1 text-label transition-colors", here ? "bg-subtle text-fg" : "text-fg-muted hover:bg-subtle hover:text-fg")}
          >
            <StepDot state={s.state} />
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
