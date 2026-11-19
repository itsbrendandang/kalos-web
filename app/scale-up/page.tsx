import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { ReadoutTool } from "@/components/scale/readout-tool";
import { ScaleTrack } from "@/components/scale/scale-track";

/**
 * Scale-up, outside any campaign. Two things, both honest about what the
 * engine does:
 *  - the staged path to scale, drawn as a map: the engine stores no stages
 *    and no go/no-go decisions, so nothing on it is ever marked done;
 *  - the scale-up readout (POST /api/scale/readout, stateless): upload a
 *    multi-scale sheet, get the engine's prediction with its interval, or its
 *    refusal with what data would fix it. The readout page itself stays the
 *    printable record (see components/scale/readout-result.tsx).
 */
export default function ScaleUpPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        title="Scale-up"
        description="The path from screening plates to a pilot bioreactor, what Kalos can show as evidence at each stage, and a readout that predicts the next scale from your own data or says why it will not."
      />

      <Section
        id="path"
        title="Staged path to scale"
        description="Six stages, each closed by a go/no-go call your team makes. Kalos supplies evidence along the way; it does not track the stages or record the decisions."
      >
        <ScaleTrack />
      </Section>

      <Section
        id="readout"
        title="Scale-up readout"
        description="Upload runs from at least three scales and name a larger target scale. The engine tests itself on your own scale ladder against two naive baselines, then either predicts the target with an interval or refuses and says what data is missing."
      >
        <ReadoutTool />
        <MethodNote />
      </Section>
    </div>
  );
}

function MethodNote() {
  return (
    <div className="flex flex-col gap-1">
      <p className="max-w-[68ch] text-caption text-fg-muted">
        Method note: the engine&apos;s own evidence for this readout is from synthetic scale-up data only; it has not yet been tested on real
        batch data. Its interval is approximate coverage, not calibrated. For development decisions only.
      </p>
      <Disclosure summary="How the readout decides">
        <div className="flex max-w-[68ch] flex-col gap-3 text-body text-fg-muted">
          <p>
            <span className="text-fg">Entry checks.</span> The sheet needs runs at three or more distinct scales and few blank cells in the
            columns used, and the target must be larger than every scale in the sheet but not far beyond the largest. A sheet that fails
            gets a plain reason, not a number.
          </p>
          <p>
            <span className="text-fg">Ladder backtest.</span> Each scale with enough smaller scales below it is hidden in turn and predicted
            from the smaller ones only. Its error is compared with two naive baselines: carrying the smallest scale&apos;s mean forward, and
            copying the most similar recipe run at another scale.
          </p>
          <p>
            <span className="text-fg">Decision.</span> A number is issued only when the model beats both baselines over enough held-out runs
            and the step to the target is close to a step the backtest supported. Otherwise the engine refuses and lists what would change
            its answer. The exact thresholds are printed on every readout.
          </p>
          <p>
            <span className="text-fg">Interval.</span> Split-conformal on the backtest errors. Because a scale you have not run need not
            behave like the scales tested, the engine labels it approximate coverage and never calls it calibrated.
          </p>
          <p>
            <span className="text-fg">Storage.</span> Nothing is stored on the server. The readout prints a SHA-256 of the uploaded file so
            the same sheet can be checked and the readout regenerated.
          </p>
        </div>
      </Disclosure>
    </div>
  );
}
