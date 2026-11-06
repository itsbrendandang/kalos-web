import { Disclosure } from "@/components/kit/disclosure";
import type { BatchModel } from "@/components/campaign/plan/use-batch-model";
import type { PlanAnalysis } from "@/components/campaign/plan-view";
import { BAND_METHOD, runFacts } from "@/components/campaign/plan/run-facts";
import { formatNumber } from "@/lib/format";

/**
 * Method detail for the round: how the checks ran, how the recipes were made,
 * and the engine's own strings kept verbatim one click down. Plain words
 * above; the engine's names only inside the disclosures.
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
          How these recipes were made
        </h3>
        <p className="max-w-[72ch] text-body text-fg">
          Predicted values and likely ranges are the model&apos;s estimates from {formatNumber(d.n, "count")} measured {d.n === 1 ? "run" : "runs"}, not results. The search has not been
          checked against lab results.
        </p>
        <Disclosure summary="What Kalos recorded about this model">
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
            <p className="text-body text-fg-muted">Not reported: how this model was made is not recorded.</p>
          )}
        </Disclosure>
        <Disclosure summary="How the likely range was worked out">
          <p className="max-w-[72ch] text-body text-fg-muted">{BAND_METHOD}</p>
        </Disclosure>
      </section>

      {raw.length ? (
        <Disclosure summary="As Kalos wrote it">
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
