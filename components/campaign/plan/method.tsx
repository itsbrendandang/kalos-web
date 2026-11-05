import { Disclosure } from "@/components/kit/disclosure";
import type { BatchModel } from "@/components/campaign/plan/use-batch-model";
import { runFacts, type PlanAnalysis } from "@/components/campaign/plan-view";
import { formatNumber } from "@/lib/format";

/**
 * Method detail for the batch: how the checks ran, how the batch was made, and
 * the engine's own strings kept verbatim one click down. Plain words above;
 * raw values only inside the disclosure.
 */
export function MethodDetails({ d, m }: { d: PlanAnalysis; m: BatchModel }) {
  const facts = runFacts(d.run);
  const raw = m.rawDetails;
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="plan-method-checks" className="flex flex-col gap-2">
        <h3 id="plan-method-checks" className="text-heading text-fg">
          How the checks ran
        </h3>
        {m.checkSentences.length ? (
          <ul className="flex max-w-[72ch] flex-col gap-1.5 text-body text-fg">
            {m.checkSentences.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-fg-muted">No check ran against a range, because none was reported.</p>
        )}
      </section>

      <section aria-labelledby="plan-method-made" className="flex flex-col gap-2">
        <h3 id="plan-method-made" className="text-heading text-fg">
          How this batch was made
        </h3>
        {facts.length ? (
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 text-body">
            {facts.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-fg-muted">{f.label}</dt>
                <dd className="min-w-0 break-words text-fg">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-body text-fg-muted">Not reported: how this analysis was produced is not recorded.</p>
        )}
        <p className="max-w-[72ch] text-caption text-fg-muted">
          Predicted values and bands are the model&apos;s estimates from {formatNumber(d.n, "count")} measured {d.n === 1 ? "run" : "runs"}, not results. The optimizer has not been validated
          against lab outcomes.
        </p>
      </section>

      {raw.length ? (
        <Disclosure summary="Engine details, as sent">
          <ul className="flex flex-col gap-1 font-mono text-code break-words text-fg-muted">
            {raw.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}
