import type { ReactNode } from "react";
import { Disclosure } from "@/components/kit/disclosure";
import { Verdict } from "@/components/kit/verdict";
import { DatasetEyebrow, PlanHeader } from "@/components/campaign/plan/header";
import type { BatchModel } from "@/components/campaign/plan/use-batch-model";
import { trustNumbers, trustSentence, trustTone } from "@/components/campaign/plan/copy";
import { RANK_AGREEMENT_GLOSS } from "@/components/campaign/trust-numbers";
import { WhyLine } from "@/components/kit/why-line";

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
      <p>{m.verdict.reason}</p>
      {numbers ? (
        <p className="mt-1 tabular-nums">
          {numbers} {RANK_AGREEMENT_GLOSS}
        </p>
      ) : null}
    </>
  );
  return (
    <PlanHeader
      round={round}
      eyebrow={<DatasetEyebrow name={dataset} />}
      meta={
        <div className="mt-3 flex flex-col gap-2">
          <Verdict tone={tone}>{trustSentence(m.verdict)}</Verdict>
          <WhyLine code={m.verdict.state} className="ml-7" />
          <Disclosure summary="How the model was scored" className="ml-7 border-t-0">
            <div className="text-body text-fg-muted">{detail}</div>
          </Disclosure>
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
