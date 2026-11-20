import type { ReactNode } from "react";
import { formatTimestamp } from "@/components/kit/source-line";
import type { DataPackage } from "@/lib/report-package";

/** A full hash or id, monospace and wrapping, or n/a. */
function Code({ value }: { value: string | number | null | undefined }) {
  if (value == null || value === "") return <span className="text-fg-muted">n/a</span>;
  return <span className="font-mono text-code break-all">{value}</span>;
}

/**
 * Where every number came from: the engine build, seed, input and config
 * fingerprints and library versions, in full (not shortened), so a printed
 * report can be matched to a rerun. Anything the engine did not send is n/a.
 */
export function ProvenanceBlock({ pkg }: { pkg: DataPackage }) {
  const p = pkg.provenance;
  const libs = Object.entries(p.library_versions);
  const rows: { label: string; value: ReactNode }[] = [
    { label: "Engine version", value: <Code value={p.engine_version} /> },
    { label: "Seed", value: <span className="tabular-nums">{p.seed ?? "n/a"}</span> },
    { label: "Analysis time", value: <span className="tabular-nums">{formatTimestamp(p.analysis_timestamp)}</span> },
    { label: "Dataset", value: <Code value={pkg.data.dataset} /> },
    { label: "Sheet", value: <Code value={pkg.data.sheet} /> },
    { label: "input_sha256", value: <Code value={p.input_sha256} /> },
    { label: "provenance_sha256", value: <Code value={p.provenance_sha256} /> },
    { label: "config_sha256", value: <Code value={p.config_sha256} /> },
    { label: "Build sha", value: <Code value={p.build_sha} /> },
    {
      label: "Library versions",
      value: libs.length ? (
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {libs.map(([name, v]) => (
            <span key={name} className="font-mono text-code">
              {name} {v ?? "n/a"}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-fg-muted">n/a</span>
      ),
    },
    { label: "Package generated", value: <span className="tabular-nums">{formatTimestamp(Date.parse(pkg.generated_at))}</span> },
  ];
  return (
    <dl>
      {rows.map((r) => (
        <div key={r.label} className="grid gap-x-6 gap-y-0.5 border-t border-border py-2.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <dt className="text-label text-fg-muted">{r.label}</dt>
          <dd className="min-w-0 text-body text-fg">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
