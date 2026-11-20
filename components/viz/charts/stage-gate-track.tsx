"use client";

import type { CSSProperties } from "react";
import { Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { decisionWord, describeStageTrack, gateStateText, positionWord, recordedAt, type StageTrack, type TrackGate, type TrackStage } from "@/lib/viz-data/stage-gate";

/*
 * C11 StageGateTrack (VIZ_SPEC 5): the campaign's stages S1..Sn with their
 * volumes, the current stage a person recorded, and each stage's closing gate
 * as a diamond: FILLED when a decision is recorded (its word beside it),
 * HOLLOW when the gate is open. A recorded no-go turns every later stage
 * "paused"; nothing advances on its own and no verdict is computed here.
 * Selecting a gate opens its evidence and decision panel (the page owns it).
 */

/** The gate diamond: filled ink when a decision is recorded, hollow when open. */
export function GateDiamond({ recorded, className, size = 14 }: { recorded: boolean; className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 14 14" width={size} height={size} className={cn("shrink-0", className)} aria-hidden>
      <path
        d="M7 1.2 L12.8 7 L7 12.8 L1.2 7 Z"
        fill={recorded ? "var(--chart-measured)" : "var(--surface)"}
        stroke={recorded ? "var(--chart-measured)" : "var(--chart-reference)"}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function StageNode({ s }: { s: TrackStage }) {
  const done = s.position === "done";
  const current = s.position === "current";
  return (
    <span
      className={cn(
        "relative grid size-7 shrink-0 place-items-center rounded-full border text-caption tabular-nums",
        done && "border-fg bg-fg text-bg",
        current && "border-accent bg-surface text-fg ring-2 ring-accent",
        !done && !current && "border-border-strong bg-surface text-fg-muted",
        s.paused && "border-dashed",
      )}
    >
      {s.key}
    </span>
  );
}

function gateLine(g: TrackGate): string {
  const c = g.current;
  if (!c) return gateStateText(g);
  return `${decisionWord(c.decision)} · ${c.decided_by} · ${recordedAt(c.decided_at)}`;
}

export function StageGateTrack({
  track,
  selectedGate,
  onSelectGate,
}: {
  track: StageTrack;
  selectedGate: string | null;
  onSelectGate: (key: string) => void;
}) {
  const n = track.stages.length;
  const description = describeStageTrack(track);
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <p className="sr-only">{description}</p>
      <ol
        aria-label="Stages and gates"
        className="grid gap-0 lg:grid-cols-[repeat(var(--stage-cols),minmax(0,1fr))]"
        style={{ "--stage-cols": String(n) } as CSSProperties}
      >
        {track.stages.map((s, i) => {
          const last = i === n - 1;
          const recorded = s.gate.state === "recorded";
          const selected = selectedGate === s.key;
          const pos = positionWord(s);
          return (
            <li key={s.key} className="flex gap-3 lg:flex-col lg:gap-3">
              {/* The rail: the stage node, then the connector carrying this stage's gate diamond. */}
              <div className="flex flex-col items-center lg:flex-row lg:items-center" aria-hidden>
                <StageNode s={s} />
                <span className="relative flex min-h-12 flex-1 items-center justify-center lg:h-7 lg:min-h-0">
                  <span
                    className={cn(
                      "block h-full w-px lg:h-px lg:w-full",
                      s.paused || track.stages[i + 1]?.paused ? "border-l border-dashed border-border-strong bg-transparent lg:border-t lg:border-l-0" : "bg-border-strong",
                      last && "lg:w-1/2 lg:self-center",
                    )}
                  />
                  <GateDiamond recorded={recorded} className="absolute" />
                </span>
              </div>

              <div className={cn("min-w-0 flex-1 pb-6 lg:pr-3 lg:pb-0", last && "pb-0")}>
                <h3 className="text-label text-fg">
                  <span className="sr-only">Stage {s.key}: </span>
                  {s.label}
                </h3>
                <p className="mt-0.5 text-caption text-fg-muted tabular-nums lg:min-h-8">
                  {s.volume ?? "No vessel volume"}
                  {s.nominal ? ` · nominal ${s.nominal}` : ""}
                </p>
                {pos ? (
                  <p className={cn("mt-1 inline-flex items-center gap-1 text-caption", s.position === "current" ? "text-fg" : "text-fg-muted")}>
                    {s.paused ? <Pause className="size-3" aria-hidden /> : null}
                    {pos}
                    {s.paused && s.pausedBy ? ` by a no-go at gate ${s.pausedBy}` : ""}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelectGate(s.key)}
                  aria-pressed={selected}
                  aria-label={`Gate ${s.key}: ${gateLine(s.gate)}. Show evidence and decision.`}
                  className={cn(
                    "mt-2 flex w-full items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left text-caption",
                    selected ? "border-accent bg-accent-soft text-fg" : "border-border text-fg hover:border-border-strong hover:bg-subtle",
                  )}
                >
                  <GateDiamond recorded={recorded} size={12} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-fg-muted">Gate {s.key}</span>
                    <span className={cn("block", recorded ? "font-medium text-fg" : "text-fg-muted")}>
                      {s.gate.current ? decisionWord(s.gate.current.decision) : "open, no decision"}
                    </span>
                    {s.gate.current ? (
                      <span className="block truncate text-fg-muted">
                        {s.gate.current.decided_by} · {recordedAt(s.gate.current.decided_at).slice(0, 10)}
                      </span>
                    ) : null}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <GateDiamond recorded size={11} />
          Decision recorded by your team
        </span>
        <span className="inline-flex items-center gap-1.5">
          <GateDiamond recorded={false} size={11} />
          Gate open: no decision recorded
        </span>
        <span>The current stage is set by a person, never computed. A no-go pauses the later stages; nothing advances on its own.</span>
      </figcaption>
    </figure>
  );
}
