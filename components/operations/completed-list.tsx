import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PipelineRun } from "@/lib/mock/pipeline";
import { num } from "@/lib/utils";

/** Compact rows for recently completed runs: name, target, final value,
 *  and a link into the Results (analysis) surface. */
export function CompletedList({ runs }: { runs: PipelineRun[] }) {
  if (!runs.length) {
    return <p className="py-10 text-center text-[12px] text-muted">nothing completed yet</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-border">
      {runs.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-fg">{r.name}</div>
            <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted">{r.target}</div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            {r.predicted ? (
              <span className="tabular font-mono text-[13px] font-semibold text-fg">{num(r.predicted.value, 1)}</span>
            ) : null}
            {r.elapsedLabel ? <span className="font-mono text-[11.5px] text-muted">{r.elapsedLabel}</span> : null}
            <Link
              href="/results"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text hover:underline"
            >
              View results <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
