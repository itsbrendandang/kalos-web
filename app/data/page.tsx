"use client";

import { useMemo, useState } from "react";
import { Download, Search, X } from "lucide-react";
import { Card, Kpi, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, DemoBadge } from "@/components/page-header";
import {
  DATASETS,
  DATASET_COUNT,
  TOTAL_RUNS,
  RUNS_BY_DATASET,
  outputUnit,
  type DatasetRecord,
} from "@/lib/mock/registry";
import { cn } from "@/lib/utils";

type SortKey = "runs-desc" | "runs-asc" | "name" | "added";

const SORT_LABEL: Record<SortKey, string> = {
  "runs-desc": "Runs (high to low)",
  "runs-asc": "Runs (low to high)",
  name: "Name (A-Z)",
  added: "Date added (newest)",
};

function sortDatasets(rows: DatasetRecord[], key: SortKey): DatasetRecord[] {
  const sorted = [...rows];
  switch (key) {
    case "runs-desc":
      sorted.sort((a, b) => b.runs - a.runs);
      break;
    case "runs-asc":
      sorted.sort((a, b) => a.runs - b.runs);
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "added":
      sorted.sort((a, b) => b.addedSort.localeCompare(a.addedSort));
      break;
  }
  return sorted;
}

function StatusPill({ status }: { status: DatasetRecord["status"] }) {
  const active = status === "active";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
        active ? "border-green/30 bg-green-soft text-green" : "border-border bg-card text-muted",
      )}
    >
      {status}
    </span>
  );
}

export default function DataPage() {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("runs-desc");
  const [selected, setSelected] = useState<string | null>(null);

  const outputsTracked = useMemo(() => new Set(DATASETS.flatMap((d) => d.outputs)).size, []);
  const maxRuns = useMemo(() => Math.max(...DATASETS.map((d) => d.runs)), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DATASETS;
    return DATASETS.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.barcode.toLowerCase().includes(q) ||
        d.outputs.some((o) => o.toLowerCase().includes(q)),
    );
  }, [query]);

  const rows = useMemo(() => sortDatasets(filtered, sortKey), [filtered, sortKey]);

  const selectedDataset = selected ? (DATASETS.find((d) => d.barcode === selected) ?? null) : null;

  function toggleSelect(barcode: string) {
    setSelected((cur) => (cur === barcode ? null : barcode));
  }

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Data room"
        title="Bioprocessing data registry"
        desc="Every uploaded dataset and run is organized under a stable barcode, with identity stripped on the way in."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi hero label="Datasets" value={DATASET_COUNT} />
        <Kpi label="Runs tracked" value={TOTAL_RUNS} />
        <Kpi label="Outputs tracked" value={outputsTracked} />
        <Kpi label="Identity state" value="Anonymized" />
      </div>

      <Card>
        <SectionLabel>Runs per dataset</SectionLabel>
        <div className="flex flex-col gap-2">
          {DATASETS.map((d) => (
            <div key={d.barcode} className="flex items-center gap-3">
              <span className="w-[150px] shrink-0 truncate font-mono text-[11px] text-muted" title={d.name}>
                {d.name}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-blue-soft">
                <div className="h-full rounded-full bg-chart-1" style={{ width: `${(d.runs / maxRuns) * 100}%` }} />
              </div>
              <span className="tabular w-10 shrink-0 text-right font-mono text-[11px] text-fg">{d.runs}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SectionLabel className="mr-auto mb-0">Registry</SectionLabel>
          <DemoBadge />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search datasets, barcodes, outputs..."
              aria-label="Search datasets"
              className="h-9 w-full rounded-[10px] border border-border bg-card pr-3 pl-8 text-[13px] text-fg placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort datasets"
            className="h-9 rounded-[10px] border border-border bg-card px-3 text-[13px] text-fg"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => {}}>
            <Download />
            Export training table
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="tabular w-full border-collapse text-sm">
            <thead>
              <tr className="text-[10px] text-muted uppercase">
                <th className="border-b border-border px-3 py-2 text-left">Barcode</th>
                <th
                  className="cursor-pointer border-b border-border px-3 py-2 text-left select-none hover:text-fg"
                  onClick={() => setSortKey("name")}
                >
                  Dataset{sortKey === "name" ? " ▲" : ""}
                </th>
                <th
                  className="cursor-pointer border-b border-border px-3 py-2 text-right select-none hover:text-fg"
                  onClick={() => setSortKey(sortKey === "runs-desc" ? "runs-asc" : "runs-desc")}
                >
                  Runs{sortKey === "runs-desc" ? " ▼" : sortKey === "runs-asc" ? " ▲" : ""}
                </th>
                <th className="border-b border-border px-3 py-2 text-left">Outputs</th>
                <th className="border-b border-border px-3 py-2 text-right">Features</th>
                <th
                  className="cursor-pointer border-b border-border px-3 py-2 text-left select-none hover:text-fg"
                  onClick={() => setSortKey("added")}
                >
                  Added{sortKey === "added" ? " ▼" : ""}
                </th>
                <th className="border-b border-border px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={d.barcode}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === d.barcode}
                  onClick={() => toggleSelect(d.barcode)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSelect(d.barcode);
                    }
                  }}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-blue-soft",
                    selected === d.barcode && "bg-blue-soft",
                  )}
                >
                  <td className="border-b border-border/60 px-3 py-2 font-mono text-[12px] text-chart-1-ink">{d.barcode}</td>
                  <td className="border-b border-border/60 px-3 py-2 font-mono text-[12px]">{d.name}</td>
                  <td className="tabular border-b border-border/60 px-3 py-2 text-right font-mono text-[12px]">{d.runs}</td>
                  <td className="border-b border-border/60 px-3 py-2 text-[12px] text-muted">{d.outputs.join(" / ")}</td>
                  <td className="tabular border-b border-border/60 px-3 py-2 text-right font-mono text-[12px]">{d.features}</td>
                  <td className="border-b border-border/60 px-3 py-2 text-[12px] text-muted">{d.addedLabel}</td>
                  <td className="border-b border-border/60 px-3 py-2">
                    <StatusPill status={d.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-muted">No datasets match &ldquo;{query}&rdquo;.</p>
        ) : null}
        <p className="mt-3 text-[12px] text-muted">
          {TOTAL_RUNS} runs across {DATASET_COUNT} dataset{DATASET_COUNT === 1 ? "" : "s"}. Each run also carries its own{" "}
          <span className="font-mono text-fg">KAL-*</span> barcode. New uploads appear here after analysis.
        </p>
      </Card>

      {selectedDataset ? <DatasetDetail dataset={selectedDataset} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function DatasetDetail({ dataset, onClose }: { dataset: DatasetRecord; onClose: () => void }) {
  const runs = RUNS_BY_DATASET[dataset.barcode] ?? [];
  const inputKeys = runs.length ? Object.keys(runs[0].inputs) : [];

  const ranges = dataset.outputs.map((name) => {
    const values = runs.map((r) => r.outputs[name]).filter((v): v is number => typeof v === "number");
    const min = values.length ? Math.min(...values) : null;
    const max = values.length ? Math.max(...values) : null;
    return { name, min, max, unit: outputUnit(name) };
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-head text-[15px] font-semibold text-fg">{dataset.name}</span>
            <span className="font-mono text-[12px] text-chart-1-ink">{dataset.barcode}</span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-muted">
            {dataset.rows} rows / {dataset.features} features / {dataset.sizeLabel} / added {dataset.addedLabel} / campaign{" "}
            <span className="font-mono text-fg">{dataset.campaignHash}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {}}>
            <Download />
            Export CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dataset detail">
            <X />
            Close
          </Button>
        </div>
      </div>

      <p className="border-t border-border pt-3 text-[12px] leading-snug text-muted">
        Identity stripped on ingest - the campaign key above is a one-way hash of the original experiment key; raw
        identity is never stored.
      </p>

      {runs.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-muted">No sample runs on file for this dataset yet.</p>
      ) : (
        <>
          <div>
            <SectionLabel>Output ranges (sample)</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {ranges.map((r) => (
                <span
                  key={r.name}
                  className="rounded-full border border-border bg-blue-soft px-2.5 py-1 font-mono text-[11px] text-fg"
                >
                  {r.name} {r.min != null ? r.min : "—"}–{r.max != null ? r.max : "—"}
                  {r.unit ? ` ${r.unit}` : ""}
                </span>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Sample runs</SectionLabel>
            <div className="overflow-x-auto">
              <table className="tabular w-full border-collapse text-sm">
                <thead>
                  <tr className="text-[10px] text-muted uppercase">
                    <th className="border-b border-border px-3 py-2 text-left">Run</th>
                    {inputKeys.map((k) => (
                      <th key={k} className="border-b border-border px-3 py-2 text-right">
                        {k}
                      </th>
                    ))}
                    {dataset.outputs.map((k) => (
                      <th key={k} className="border-b border-border px-3 py-2 text-right text-chart-1-ink">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.barcode}>
                      <td className="border-b border-border/60 px-3 py-2 font-mono text-[12px] text-chart-1-ink">{r.barcode}</td>
                      {inputKeys.map((k) => (
                        <td key={k} className="tabular border-b border-border/60 px-3 py-2 text-right font-mono text-[12px]">
                          {r.inputs[k]}
                        </td>
                      ))}
                      {dataset.outputs.map((k) => (
                        <td
                          key={k}
                          className="tabular border-b border-border/60 px-3 py-2 text-right font-mono text-[12px] font-semibold text-fg"
                        >
                          {r.outputs[k] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
