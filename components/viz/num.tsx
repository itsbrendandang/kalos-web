"use client";

import { useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Ban, CircleDashed, Clock, Copy, Info, TrendingDown, TrendingUp } from "lucide-react";
import { formatDelta, formatState, formatValue, type Basis, type FormatOptions, type Formatted, type IntervalSpec, type NumState as NumStateT } from "@/lib/num";
import { sourceLines, type Source } from "@/lib/source";
import { cn } from "@/lib/utils";

/*
 * Number primitives (VIZ_SPEC 2.1, 2.6-2.8). Measured outranks predicted in
 * every channel: glyph (filled vs hollow), weight (600 vs 400), size (only a
 * measured value may use text-metric) and order.
 */

/** 10px basis glyph: filled ink dot (measured), hollow accent ring (predicted), muted diamond (derived). */
export function BasisGlyph({ basis, className }: { basis: Basis; className?: string }) {
  const cls = cn("inline-block size-2.5 shrink-0", className);
  if (basis === "measured")
    return (
      <svg viewBox="0 0 10 10" className={cls} aria-hidden>
        <circle cx="5" cy="5" r="4" fill="var(--chart-measured)" />
      </svg>
    );
  if (basis === "predicted")
    return (
      <svg viewBox="0 0 10 10" className={cls} aria-hidden>
        <circle cx="5" cy="5" r="3.6" fill="var(--surface)" stroke="var(--chart-predicted)" strokeWidth="1.6" />
      </svg>
    );
  if (basis === "derived")
    return (
      <svg viewBox="0 0 10 10" className={cls} aria-hidden>
        <path d="M5 1 L9 5 L5 9 L1 5 Z" fill="var(--chart-reference)" />
      </svg>
    );
  return null;
}

const SIZE: Record<"metric" | "title" | "body" | "table", string> = {
  metric: "text-metric",
  title: "text-title",
  body: "text-body",
  table: "text-body",
};

const WEIGHT: Record<Basis, string> = { measured: "font-semibold", predicted: "font-normal", derived: "font-medium", setting: "font-normal" };

/**
 * One number with its unit, interval and coverage. Predicted values are
 * capped at text-title (VIZ_SPEC 2.8), so a prediction can never be the
 * biggest number beside a measured one.
 */
export function Num({
  value,
  basis = "derived",
  unit,
  interval,
  source,
  size = "body",
  layout = "inline",
  glyph = true,
  options,
  className,
}: {
  value: number | null | undefined;
  basis?: Basis;
  unit?: string | null;
  interval?: IntervalSpec | null;
  source?: Source | null;
  size?: "metric" | "title" | "body" | "table";
  layout?: "inline" | "stacked";
  glyph?: boolean;
  options?: FormatOptions;
  className?: string;
}) {
  const f = formatValue(value, { ...options, basis, unit, interval });
  const shownSize = basis !== "measured" && size === "metric" ? "title" : size;
  if (f.state !== "value") return <NumText f={f} className={className} />;
  const unitEl = f.unit ? <span className={cn("text-fg-muted", shownSize === "metric" || shownSize === "title" ? "text-body" : "")}>{f.unit === "%" || f.unit === "×" ? f.unit : `\u00A0${f.unit}`}</span> : null;
  const head = (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap tabular-nums", className)}>
      {glyph && basis !== "setting" ? <BasisGlyph basis={basis} className="self-center" /> : null}
      <span className={cn(SIZE[shownSize], WEIGHT[basis], "text-fg")} aria-hidden>
        {f.value}
        {unitEl}
      </span>
      <span className="sr-only">{f.aria}</span>
      {layout === "inline" && f.interval ? (
        <span className="text-caption text-fg-muted" aria-hidden>
          {f.interval}
          {f.coverage ? ` ${f.coverage}` : ""}
        </span>
      ) : null}
      {source ? <SourceButton source={source} full={f.full} /> : null}
    </span>
  );
  if (layout === "inline" || !f.interval) return head;
  return (
    <span className="inline-flex flex-col">
      {head}
      <span className="text-caption text-fg-muted tabular-nums" aria-hidden>
        {f.interval}
        {f.coverage ? ` · ${f.coverage} ${interval?.method === "conformal" ? "held-out band" : interval?.method === "bootstrap-ci" ? "CI" : "approximate band"}` : ""}
      </span>
    </span>
  );
}

function NumText({ f, className }: { f: Formatted; className?: string }) {
  if (f.state === "absent") return null;
  return <span className={cn("text-fg-muted", className)}>{f.text}</span>;
}

/** A non-value state with its one rendering: n/a, not scored + reason, refused + reasons, awaiting. */
export function NumState({ state, className }: { state: NumStateT; className?: string }) {
  const f = formatState(state);
  if (state.kind === "absent" || state.kind === "value") return null;
  const Icon = state.kind === "not-scored" ? CircleDashed : state.kind === "refused" ? Ban : state.kind === "pending" ? Clock : null;
  const detail = state.kind === "not-scored" ? state.reason : state.kind === "na" ? state.reason : state.kind === "refused" ? state.reasons[0] : null;
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 text-fg-muted", className)} title={state.kind === "refused" ? state.reasons.join("\n") : undefined}>
      {Icon ? <Icon className="size-3.5 shrink-0 self-center" aria-hidden /> : null}
      <span>{f.text}</span>
      {detail ? <span className="text-caption">({detail})</span> : null}
    </span>
  );
}

/** A change from a NAMED baseline, never colored by sign: an arrow, the signed value, then "vs <baseline>". */
export function Delta({
  current,
  baseline,
  unit,
  baselineLabel,
  basis = "measured",
  relative = true,
  options,
  className,
}: {
  current: number | null | undefined;
  baseline: number | null | undefined;
  unit?: string | null;
  baselineLabel: string;
  basis?: Basis;
  relative?: boolean;
  options?: FormatOptions;
  className?: string;
}) {
  const d = formatDelta(current, baseline, { ...options, unit, relative, basis });
  if (d.state !== "value") return <span className={cn("text-caption text-fg-muted", className)}>n/a vs {baselineLabel}</span>;
  const up = current! > baseline!;
  const flat = d.value === "0" || /^0(\.0+)?$/.test(d.value);
  const Icon = flat ? null : up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-baseline gap-1 text-caption text-fg-muted tabular-nums", className)}>
      {Icon ? <Icon className="size-3.5 shrink-0 self-center" aria-hidden /> : null}
      <span className="text-fg">{d.text}</span>
      {d.relative ? <span>({d.relative})</span> : null}
      <span>vs {baselineLabel}</span>
      {basis === "predicted" ? <span>, predicted</span> : null}
    </span>
  );
}

/** The provenance affordance: an "i" that opens every source field, the unrounded value and a copy button. */
export function SourceButton({ source, full, className, children }: { source: Source; full?: string; className?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const lines = sourceLines(source);
  const text = [full ? `Value: ${full}` : null, ...lines.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join("\n");
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Source: ${source.label}`}
        className={cn("inline-grid size-6 shrink-0 place-items-center self-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg", className)}
      >
        {children ?? <Info className="size-3.5" aria-hidden />}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-50">
          <Popover.Popup className="w-80 max-w-[90vw] rounded-lg border border-border bg-surface p-3 text-caption text-fg shadow-popover outline-none">
            <Popover.Title className="text-label text-fg">{source.label}</Popover.Title>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {full ? (
                <>
                  <dt className="text-fg-muted">Value</dt>
                  <dd className="break-all tabular-nums">{full}</dd>
                </>
              ) : null}
              {lines.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd className={cn("break-all", /SHA|Build|Field|Run/.test(k) ? "font-mono text-code" : "")}>{v}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-caption text-fg hover:bg-subtle"
              onClick={() => {
                void navigator.clipboard?.writeText(text).then(() => setCopied(true));
              }}
            >
              <Copy className="size-3.5" aria-hidden />
              {copied ? "Copied" : "Copy source"}
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
