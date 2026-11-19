import type { ReactNode } from "react";
import { Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

/** Seconds (engine) or milliseconds since the epoch as a fixed, locale-stable "2026-11-18 14:02 UTC". */
export function formatTimestamp(t: number | null | undefined): string {
  if (t == null || !Number.isFinite(t)) return "n/a";
  const ms = t < 1e12 ? t * 1000 : t;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** The first 10 hex characters of a hash, for display; the full value stays in the title and exports. */
export const shortHash = (h: string | null | undefined): string => (h ? h.slice(0, 10) : "n/a");

/**
 * Where the numbers on a surface come from, in one quiet line: "Engine
 * analysis of runs.csv · 2026-11-18 14:02 UTC · engine 0.1.0 · provenance
 * 9836c009ef". Every part the engine did not send reads n/a or is left out;
 * nothing is invented. This is Kalos's signature: every number traces to a
 * source.
 */
export function SourceLine({
  parts,
  className,
}: {
  /** Label/value pairs; a null value is shown as "n/a", an undefined one is omitted. */
  parts: { label: string; value: ReactNode | null | undefined; title?: string }[];
  className?: string;
}) {
  const shown = parts.filter((p) => p.value !== undefined);
  if (shown.length === 0) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-muted", className)}>
      <Fingerprint className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">Source:</span>
      {shown.map((p) => (
        <span key={p.label} title={p.title} className="inline-flex items-baseline gap-1">
          <span>{p.label}</span>
          <span className="text-fg tabular-nums">{p.value ?? "n/a"}</span>
        </span>
      ))}
    </p>
  );
}
