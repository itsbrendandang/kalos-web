import { MeasuredValue } from "@/components/campaign/plan/marks";
import { ExampleBadge, Badge } from "@/components/ui/badge";
import { displayRound } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";

/**
 * Demo mode only (NEXT_PUBLIC_DEMO_MODE), and only when the engine confirmed
 * there are no campaigns: what a campaign row looks like, from the static
 * example in lib/mock/campaign.ts. Labelled "Example data", not a link, and
 * never shown next to real campaigns.
 */
export function DemoCampaignPreview() {
  const c = DEMO_CAMPAIGN;
  return (
    <section aria-label="Example campaign" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-heading text-fg">What a campaign looks like</h2>
        <ExampleBadge />
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-panel md:flex-row md:items-center md:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-heading text-fg">Example: fed-batch titer</span>
            <Badge tone="accent">Round {displayRound(c.round)}</Badge>
          </div>
          <p className="mt-1 text-caption text-fg-muted">
            Maximize <span className="font-mono text-code text-fg">{c.target}</span>
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 md:w-[26rem]">
          <div>
            <dt className="text-caption text-fg-muted">Best so far</dt>
            <dd className="text-label">
              <MeasuredValue value={formatNumber(c.best)} />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-fg-muted">Runs awaiting results</dt>
            <dd className="text-label text-fg tabular-nums">{formatNumber(c.n_awaiting, "count")}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
