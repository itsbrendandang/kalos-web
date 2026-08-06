import { cn } from "@/lib/utils";
import { formatAge } from "@/lib/workspace/log-logic";
import { reliabilityBadge, verdictCopy, verdictMeta } from "@/lib/workspace/log-copy";
import type { WorkspaceLogStats } from "@/lib/workspace/log-types";
import { InlineNumeral } from "./primitives";

const TONE_CLASS = {
  good: "bg-green-soft text-green",
  warn: "bg-amber-soft text-amber",
  unknown: "bg-blue-tint text-muted",
} as const;

/** Design spec 1.3.A. A reliability pill, a mono meta line, a 36px
 *  Newsreader headline, and a 16.5px Newsreader sub-paragraph whose numerals
 *  are inline mono. Every string comes from lib/workspace/log-copy.ts, which
 *  branches on the engine's own reliability verdict rather than asserting the
 *  design's reliable-case sentence unconditionally. */
export function VerdictHero({
  stats,
  proposals,
}: {
  stats: WorkspaceLogStats;
  proposals: { predicted: number | null }[];
}) {
  const badge = reliabilityBadge(stats.reliable);
  const age = stats.updatedAt != null ? formatAge(stats.updatedAt) : null;
  const meta = verdictMeta(stats, age);
  const copy = verdictCopy(stats, proposals);

  return (
    <section>
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-[20px] px-[9px] py-[3px] text-[11px] font-semibold",
            TONE_CLASS[badge.tone],
          )}
        >
          {badge.label}
        </span>
        {meta.length > 0 && (
          <span className="font-plex-mono text-[11px] text-muted">{meta.join(" · ")}</span>
        )}
      </div>

      <h2 className="max-w-[28ch] font-serif text-[36px] leading-[1.2] font-semibold tracking-[-0.015em] text-pretty text-fg">
        {copy.headline}
      </h2>

      <p className="mt-[18px] max-w-[60ch] font-serif text-[16.5px] leading-[1.6] text-pretty text-muted">
        {copy.lead}
        {copy.movement && (
          <>
            {" "}
            These {copy.movement.count} should move your best from{" "}
            <InlineNumeral>{copy.movement.best}</InlineNumeral> to about{" "}
            <InlineNumeral>{copy.movement.predicted}</InlineNumeral>.
          </>
        )}
      </p>
    </section>
  );
}
