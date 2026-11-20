import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { CampaignTracks } from "@/components/scale/campaign-tracks";
import { ReadoutTool } from "@/components/scale/readout-tool";

/**
 * Scale-up, outside any campaign:
 *  - the scale-up readout (POST /api/scale/readout.json, stateless): upload a
 *    multi-scale sheet, get the engine's prediction with its interval, or its
 *    refusal with what data would fix it, drawn as the C9 ladder chart against
 *    the engine's default stage volume ranges (labelled as such);
 *  - links to each campaign's own scale-up track, where the current stage is
 *    recorded and each go/no-go gate decision is recorded by a person
 *    (GET/PUT /api/campaigns/{id}/stages and /gates).
 */
export default function ScaleUpPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        title="Scale-up"
        description="Predict the next scale from your own multi-scale data, or see why Kalos will not. Each campaign keeps its own stage track, where your team records the current stage and every go/no-go gate decision."
      />

      <Section
        id="readout"
        title="Scale-up readout"
        description="Upload runs from at least three scales and name a larger target scale. The engine tests itself on your own scale ladder against two naive baselines, then either predicts the target with an interval or refuses and says what data is missing."
      >
        <ReadoutTool />
        <MethodNote />
      </Section>

      <Section
        id="tracks"
        title="Stage tracks and gates"
        description="Stages and go/no-go decisions are recorded per campaign, by your team: Kalos stores them and shows its computed evidence beside each gate, but never makes the call. To link a readout to a decision, run it on the campaign's own track page."
      >
        <CampaignTracks />
      </Section>
    </div>
  );
}

function MethodNote() {
  return (
    <div className="flex flex-col gap-1">
      <p className="max-w-[68ch] text-caption text-fg-muted">
        Method note: the engine&apos;s own evidence for this readout is from synthetic scale-up data only; it has not yet been tested on real
        batch data. The engine labels its interval approximate coverage. For development decisions only.
      </p>
      <Disclosure summary="How the readout decides">
        <div className="flex max-w-[68ch] flex-col gap-3 text-body text-fg-muted">
          <p>
            <span className="text-fg">Entry checks.</span> The sheet needs runs at three or more distinct scales and few blank cells in the
            columns used, and the target must be larger than every scale in the sheet but not far beyond the largest. A sheet that fails
            gets a plain reason, not a number.
          </p>
          <p>
            <span className="text-fg">Ladder backtest.</span> Nested leave-last-scale-out: each scale with enough smaller scales below it is
            predicted by a model fit only on the strictly smaller scales. Its error is compared with two naive baselines: carrying the smallest scale&apos;s mean forward, and
            copying the most similar recipe run at another scale.
          </p>
          <p>
            <span className="text-fg">Decision.</span> A number is issued only when the model beats both baselines over enough held-out runs
            and the step to the target is close to a step the backtest supported. Otherwise the engine refuses and lists what would change
            its answer. The exact thresholds are printed on every readout.
          </p>
          <p>
            <span className="text-fg">Interval.</span> Split-conformal on the backtest errors, printed with the coverage the engine reports.
            Because a scale you have not run need not behave like the scales tested, the engine labels that coverage approximate.
          </p>
          <p>
            <span className="text-fg">Storage.</span> The readout itself is not stored on the server. It carries a readout id (a SHA-256
            over the engine version, the sheet and the target) and the SHA-256 of the uploaded file, so the same sheet can be checked, the
            readout regenerated, and a gate decision can link to it.
          </p>
        </div>
      </Disclosure>
    </div>
  );
}
