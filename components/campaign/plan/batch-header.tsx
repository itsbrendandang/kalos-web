import type { ReactNode } from "react";
import { Verdict } from "@/components/kit/verdict";
import { DatasetEyebrow, PlanHeader } from "@/components/campaign/plan/header";
import type { BatchModel } from "@/components/campaign/plan/use-batch-model";
import { trustNumbers, trustSentence, trustTone } from "@/components/campaign/plan/copy";

/**
 * Title, the trust verdict as one plain sentence (the numbers and the engine's
 * reason one click down), and the single primary action on the right.
 */
export function BatchHeader({
  dataset,
  round,
  target,
  m,
  approve,
  hint,
}: {
  dataset: string;
  round: number;
  target: string;
  m: BatchModel;
  approve: ReactNode;
  hint: string | null;
}) {
  const tone = trustTone(m.verdict);
  const numbers = trustNumbers(m.verdict);
  const detail = (
    <>
      {numbers ? <p className="tabular-nums">{numbers}</p> : null}
      <p className={numbers ? "mt-1" : undefined}>{m.verdict.reason}</p>
    </>
  );
  return (
    <PlanHeader
      round={round}
      eyebrow={<DatasetEyebrow name={dataset} />}
      meta={
        <div className="mt-3 flex flex-col gap-2">
          <Verdict tone={tone} detail={detail} detailLabel="How the model ranks past runs">
            {trustSentence(m.verdict)}
          </Verdict>
          <p className="ml-7 text-label text-fg-muted">
            Target <span className="font-mono text-code text-fg">{target}</span>
          </p>
        </div>
      }
      action={
        <>
          {approve}
          {hint ? <span className="text-caption text-fg-muted">{hint}</span> : null}
        </>
      }
    />
  );
}
