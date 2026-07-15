import type { Proposal, ProvenanceEntry } from "@/lib/api";

/**
 * "Model read" / "Watch-outs" / "Next actions" copy under the drivers
 * tornado. Every line here is derived from real fields on the current
 * analysis (drivers, oof, provenance, proposals) - nothing is a fixed
 * ideal range or a number specific to one dataset.
 */
export function DriverInsights({
  target,
  drivers,
  n,
  nonProducers,
  provenance,
  proposals,
  proposalFeatures,
}: {
  target: string;
  drivers: { name: string; rho: number }[];
  n: number;
  nonProducers: number;
  provenance?: ProvenanceEntry[];
  proposals: Proposal[];
  proposalFeatures: string[];
}) {
  const top = drivers[0];
  const second = drivers[1];
  const negativeAmongTop = drivers.slice(0, 3).find((dr) => dr.rho < 0 && dr.name !== second?.name);

  const modelRead: string[] = [];
  if (top) {
    modelRead.push(`${top.name} carries the strongest signal (rho ${top.rho >= 0 ? "+" : ""}${top.rho.toFixed(2)}).`);
  }
  if (second) {
    modelRead.push(`${second.name} is the next largest driver (rho ${second.rho >= 0 ? "+" : ""}${second.rho.toFixed(2)}).`);
  }
  if (negativeAmongTop) {
    modelRead.push(
      `${negativeAmongTop.name} is associated with lower ${target} (rho ${negativeAmongTop.rho.toFixed(2)}).`,
    );
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
  if (proposals.length > 0) {
    nextActions.push(
      `Run the ${proposals.length} proposed recipe${proposals.length === 1 ? "" : "s"} below${
        exploitCount === 0 ? " - all target uncertainty reduction or batch diversity this round" : ""
      }.`,
    );
  }
  if (top && proposalFeatures.includes(top.name)) {
    nextActions.push(`${top.name} is varied directly in this batch, the strongest lever available.`);
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
                  <span className="text-explore-deep">{w.value}</span>
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
