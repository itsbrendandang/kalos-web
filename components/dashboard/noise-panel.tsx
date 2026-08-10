import { Activity, Layers, Repeat2 } from "lucide-react";

import type { NoiseReport } from "@/lib/api";
import {
  hasNoiseSignal,
  noiseHeadline,
  noiseQuality,
  reproducibilityGap,
  unreplicatedCount,
} from "@/lib/noise";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHead } from "@/components/ui/section-head";
import { StatTile } from "@/components/ui/stat-tile";
import { fmt } from "@/lib/utils";

/**
 * Signal versus assay noise, and the two different "best" numbers.
 *
 * The engine has always returned this and the portal has never shown it, which
 * left a real gap: the only "best" a scientist could see was the best single
 * measurement, and that number rewards whichever well caught a noise spike. This
 * panel puts the shippable number next to it and quantifies the difference.
 *
 * Ordered as a decision, not as a data dump: the headline states what the split
 * means for the NEXT batch, then the two bests sit side by side so the gap is
 * visible without arithmetic, then the underlying spreads for anyone who wants
 * to check the claim.
 */
export function NoisePanel({ noise, target }: { noise?: NoiseReport | null; target: string }) {
  // Absent block (older engine) or nothing estimable: render nothing rather than
  // an empty frame implying the analysis was silent on the question.
  if (!noise || !hasNoiseSignal(noise)) return null;

  const quality = noiseQuality(noise.icc);
  const gap = reproducibilityGap(noise);
  const unreplicated = unreplicatedCount(noise);
  const headline = noiseHeadline(noise);
  const unit = target.replace(/\s*\([^)]*\)\s*$/, "");

  // Severity is carried by an icon and a text label as well as colour, since a
  // colour-only signal fails for a colourblind reader and this is a scientific
  // judgement, not decoration.
  const verdict: { text: string; className: string } =
    quality === "noise-dominated"
      ? { text: "Noise dominated", className: "border-amber/30 bg-amber-soft text-amber" }
      : quality === "mixed"
        ? { text: "Mixed signal", className: "border-amber/30 bg-amber-soft text-amber" }
        : quality === "signal-dominated"
          ? { text: "Signal dominated", className: "border-green/30 bg-green-soft text-green" }
          : { text: "Not estimable", className: "border-border bg-card text-muted" };

  return (
    <Card className="flex flex-col gap-3.5">
      <SectionHead
        title="Assay noise and reproducibility"
        sub={`How much of the spread in ${unit} is real recipe effect`}
        badge={
          <Badge variant="outline" className={verdict.className}>
            <Activity className="size-3.5" />
            {verdict.text}
          </Badge>
        }
      />

      {headline ? <p className="max-w-[78ch] text-[13.5px] leading-5 text-fg">{headline}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Best reproducible"
          value={noise.best_reproducible != null ? fmt(noise.best_reproducible, 2) : "n/a"}
          hint="Replicate-averaged - the shippable number"
          tooltip="The best recipe after averaging its replicates. This is the titer you could expect to reproduce, and the number the optimizer targets when the sheet supports it."
          tone={noise.best_reproducible != null ? "accent" : "neutral"}
        />
        <StatTile
          label="Best single measurement"
          value={noise.best_single != null ? fmt(noise.best_single, 2) : "n/a"}
          hint={
            gap
              ? `${fmt(gap.abs, 2)} above reproducible${gap.pct != null ? ` (${fmt(gap.pct, 1)}%)` : ""}`
              : "single highest reading"
          }
          tooltip="The single highest reading on the sheet. It rewards whichever well caught a noise spike, so optimizing against it chases measurement luck rather than a better recipe."
        />
        <StatTile
          label="Signal / noise spread"
          value={
            noise.signal_sd != null && noise.noise_sd != null
              ? `${fmt(noise.signal_sd, 2)} / ${fmt(noise.noise_sd, 2)}`
              : "n/a"
          }
          hint={noise.icc != null ? `ICC ${fmt(noise.icc, 2)}` : "not estimable"}
          tooltip="Recipe-to-recipe signal standard deviation against assay noise standard deviation, both in the target's units. ICC is the fraction of total variance that is signal."
          icon={Layers}
        />
        <StatTile
          label="Replicated recipes"
          value={`${noise.n_replicated} / ${noise.n_recipes}`}
          hint={
            unreplicated != null && unreplicated > 0
              ? `${unreplicated} run once only`
              : "every recipe replicated"
          }
          tooltip="Recipes run more than once, out of the distinct recipes on the sheet. Without replicates, assay noise cannot be separated from real recipe effect at all."
          icon={Repeat2}
        />
      </div>

      {/* Whether the proposals themselves used the reproducible objective is a
          different claim from the diagnosis above, so it is stated separately
          rather than folded into the headline. */}
      <p className="text-[12px] text-muted">
        {noise.replicate_aware
          ? "The proposed batch was fit on the replicate-averaged objective with the measured noise floor supplied to the model."
          : "The proposed batch was fit on individual measurements - not enough replicate structure to use the reproducible objective."}
      </p>
    </Card>
  );
}
