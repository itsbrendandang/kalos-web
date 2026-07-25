import type { Driver, Proposal, ProvenanceEntry } from "@/lib/api";

/** Signed 2-decimal rho, e.g. "+0.52" or "-0.28". */
function signed(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

/**
 * "Model read" / "Watch-outs" / "Next actions" copy under the drivers
 * tornado. Every line here is derived from real fields on the current
 * analysis (drivers, oof, provenance, proposals) - nothing is a fixed
 * ideal range or a number specific to one dataset.
 *
 * The model-read copy is significance-aware: it only calls an input a
 * "driver" when its 95% CI excludes zero. Everything else is described as
 * a lead or as "not yet significant" - never stated as fact.
 */
export function DriverInsights({
  target,
  drivers,
  n,
  nonProducers,
  provenance,
  proposals,
  proposalFeatures,
  clearsFloor,
}: {
  target: string;
  drivers: Driver[];
  n: number;
  nonProducers: number;
  provenance?: ProvenanceEntry[];
  proposals: Proposal[];
  proposalFeatures: string[];
  /** Whether the held-out reliability clears its trust floor; null if not scored. */
  clearsFloor: boolean | null;
}) {
  const top = drivers[0];
  const sig = drivers.filter((dr) => dr.significant);
  const notSig = drivers.filter((dr) => !dr.significant);

  const modelRead: string[] = [];
  if (sig.length === 0) {
    if (top) {
      modelRead.push(
        `No input is statistically distinguishable from noise at n=${n} - every driver's 95% CI includes zero. ` +
          `The largest correlation (${top.name}, rho ${signed(top.rho)}) is a lead worth testing, not a confirmed driver.`,
      );
    }
  } else {
    sig.forEach((dr, i) => {
      const direction = dr.rho >= 0 ? "higher" : "lower";
      modelRead.push(
        i === 0
          ? `${dr.name} is a confirmed driver, associated with ${direction} ${target} (rho ${signed(dr.rho)}, 95% CI excludes zero).`
          : `${dr.name} is also significant, associated with ${direction} ${target} (rho ${signed(dr.rho)}).`,
      );
    });
    if (notSig.length) {
      modelRead.push(
        `${notSig.map((dr) => dr.name).join(", ")} ${notSig.length === 1 ? "is" : "are"} not yet significant (95% CI includes zero).`,
      );
    }
  }

  const missingFeatures = (provenance ?? [])
    .filter((p) => p.status === "kept_feature" && p.non_null < n)
    .sort((a, b) => a.non_null - b.non_null);
  const missingFeature = missingFeatures[0];
  const missingCount = missingFeature ? n - missingFeature.non_null : 0;
  const moreMissing = missingFeatures.length - 1;

  const exploreCount = proposals.filter((p) => p.mode === "explore").length;
  const exploitCount = proposals.length - exploreCount;

  const watchOuts: { label: string; value: string }[] = [];
  if (nonProducers > 0) {
    const pct = ((nonProducers / n) * 100).toFixed(0);
    watchOuts.push({
      label: "Non-producers",
      value: `${nonProducers} of ${n} runs (${pct}%) measured zero ${target}`,
    });
  }
  if (missingFeature) {
    watchOuts.push({
      label: `${missingFeature.name} coverage`,
      value: `missing in ${missingCount} of ${n} rows${moreMissing > 0 ? ` (+${moreMissing} more)` : ""}`,
    });
  }
  if (proposals.length > 0) {
    watchOuts.push({
      label: "Proposal mix",
      value: exploitCount === 0 ? `all ${proposals.length} are explore-mode` : `${exploreCount} explore / ${exploitCount} exploit`,
    });
  }

  const nextActions: string[] = [];
  if (sig.length === 0 && clearsFloor === false) {
    nextActions.push("This round is about learning - run the batch to gather signal before trusting any driver.");
  }
  if (proposals.length > 0) {
    nextActions.push(
      `Run the ${proposals.length} proposed recipe${proposals.length === 1 ? "" : "s"} below${
        exploitCount === 0 ? " - all target uncertainty reduction or batch diversity this round" : ""
      }.`,
    );
  }
  if (sig[0] && proposalFeatures.includes(sig[0].name)) {
    nextActions.push(`${sig[0].name} is varied directly in this batch, the strongest confirmed lever available.`);
  }
  if (nonProducers > 0) {
    nextActions.push(
      `Review the ${nonProducers} zero-${target} run${nonProducers === 1 ? "" : "s"} before trusting driver estimates near their range extremes.`,
    );
  }
  if (missingFeature) {
    nextActions.push(
      `Fill missing ${missingFeature.name} values (${missingCount} of ${n} rows) to stabilize ${
        moreMissing > 0 ? "the driver estimates" : "its driver estimate"
      }.`,
    );
  }

  return (
    <>
      <div className="mt-3 grid grid-cols-1 gap-3 rounded-[10px] border border-border bg-bg p-3 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Model read</div>
          <ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-snug text-muted">
            {modelRead.length ? (
              modelRead.map((line) => (
                <li key={line} className="flex gap-1.5">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted" />
                  {line}
                </li>
              ))
            ) : (
              <li>No drivers to read yet.</li>
            )}
          </ul>
        </div>
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Watch-outs</div>
          <div className="mt-2 flex flex-col gap-1.5 text-[12px]">
            {watchOuts.length ? (
              watchOuts.map((w) => (
                <div key={w.label} className="flex items-center justify-between gap-2">
                  <span className="text-muted">{w.label}</span>
                  <span className="text-right text-explore-deep">{w.value}</span>
                </div>
              ))
            ) : (
              <span className="text-muted">No flags from this analysis.</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-[10px] border border-border p-3">
        <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">Next actions this cycle</div>
        <div className="mt-2 flex flex-col gap-1.5 text-[12px] text-muted">
          {nextActions.length ? (
            nextActions.map((a) => (
              <div key={a} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                {a}
              </div>
            ))
          ) : (
            <span>No next actions derived from this analysis.</span>
          )}
        </div>
      </div>
    </>
  );
}
