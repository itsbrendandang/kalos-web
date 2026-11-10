"use client";

import { useMemo, useState } from "react";
import { Download, PlugZap, Search, X } from "lucide-react";
import { SortableHead, type SortDirection } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/honest-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, DemoBadge } from "@/components/page-header";
import { formatNumber } from "@/lib/format";
import {
  DATASETS,
  DATASET_COUNT,
  TOTAL_RUNS,
  RUNS_BY_DATASET,
  outputUnit,
  type DatasetRecord,
} from "@/lib/mock/registry";
import { DEMO_MODE } from "@/lib/demo";

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
  return (
    <Badge tone={status === "active" ? "good" : "neutral"} variant={status === "active" ? "soft" : "outline"}>
      {status === "active" ? "Active" : "Archived"}
    </Badge>
  );
}

/** Engine credit, relocated here from the primary nav:
 *  the Data room is the registry/provenance surface, so this is where the
 *  model that consumes the registry gets attributed rather than in chrome
 *  that's visible on every route. */
function EngineCredit() {
  return <p className="text-center text-caption text-fg-muted">powered by BoTorch + ESM-2</p>;
}

/** Honest empty state: the registry has no live source yet, so with demo mode off
 *  it renders nothing fabricated rather than a list of simulated datasets. */
function NoLiveRegistry() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeader eyebrow="Data room" title="Bioprocessing data registry"
        desc="The datasets and runs the engine has seen." />
      <EmptyState
        icon={PlugZap}
        title="No live datasets"
        description={
          <>
            No live data registry is connected yet. Example data is off, so there is nothing to show here.
          </>
        }
      />
      <EngineCredit />
    </div>
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

  const dir = (k: SortKey): SortDirection => (sortKey === k ? (k === "added" ? "descending" : "ascending") : "none");

  function toggleSelect(barcode: string) {
    setSelected((cur) => (cur === barcode ? null : barcode));
  }

  if (!DEMO_MODE) return <NoLiveRegistry />;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Data room"
        title="Bioprocessing data registry"
        desc="Example datasets and runs, shown because example data is on."
      />

      <dl className="grid gap-x-8 gap-y-4 border-y border-border py-5 sm:grid-cols-3">
        {[
          ["Datasets", DATASET_COUNT],
          ["Runs tracked", TOTAL_RUNS],
          ["Outputs tracked", outputsTracked],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-label text-fg-muted">{label}</dt>
            <dd className="mt-1 text-metric tabular-nums text-fg">{formatNumber(Number(value), "count")}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h2 className="mb-3 text-heading text-fg">Runs per dataset</h2>
        <ul className="flex flex-col gap-2">
          {DATASETS.map((d) => (
            <li key={d.barcode} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate font-mono text-code text-fg-muted" title={d.name}>
                {d.name}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full bg-chart-1" style={{ width: `${(d.runs / maxRuns) * 100}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right text-body tabular-nums text-fg">{formatNumber(d.runs, "count")}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-heading text-fg">Registry</h2>
          <DemoBadge />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search datasets, barcodes, outputs..."
              aria-label="Search datasets"
              className="pl-8"
            />
          </div>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger aria-label="Sort datasets">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SORT_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => {}}>
            <Download />
            Export training table
          </Button>
        </div>

        <div role="region" aria-label="Dataset registry, scrollable" tabIndex={0} className="max-h-[480px] overflow-auto rounded-lg">
        <Table containerClassName="overflow-visible">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Barcode</TableHead>
              <SortableHead direction={dir("name")} onSort={() => setSortKey("name")}>
                Dataset
              </SortableHead>
              <SortableHead
                numeric
                direction={sortKey === "runs-desc" ? "descending" : sortKey === "runs-asc" ? "ascending" : "none"}
                onSort={() => setSortKey(sortKey === "runs-desc" ? "runs-asc" : "runs-desc")}
              >
                Runs
              </SortableHead>
              <TableHead>Outputs</TableHead>
              <TableHead numeric>Features</TableHead>
              <SortableHead direction={dir("added")} onSort={() => setSortKey("added")}>
                Added
              </SortableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow
                key={d.barcode}
                onClick={() => toggleSelect(d.barcode)}
                data-state={selected === d.barcode ? "selected" : undefined}
                className="cursor-pointer"
              >
                <TableCell>
                  <button
                    type="button"
                    aria-pressed={selected === d.barcode}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(d.barcode);
                    }}
                    className="rounded-sm font-mono text-code text-accent hover:underline"
                  >
                    {d.barcode}
                  </button>
                </TableCell>
                <TableCell className="font-mono text-code">{d.name}</TableCell>
                <TableCell numeric>{formatNumber(d.runs, "count")}</TableCell>
                <TableCell className="text-fg-muted">{d.outputs.join(" / ")}</TableCell>
                <TableCell numeric>{d.features}</TableCell>
                <TableCell className="text-fg-muted">{d.addedLabel}</TableCell>
                <TableCell>
                  <StatusPill status={d.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={Search}
            className="py-8"
            title="No datasets match your search"
            description={`No dataset, barcode, or output matched “${query}”.`}
            action={
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : null}
        <p className="mt-3 text-caption text-fg-muted">
          {formatNumber(TOTAL_RUNS, "count")} runs across {DATASET_COUNT} dataset{DATASET_COUNT === 1 ? "" : "s"}. New uploads appear here after analysis.
        </p>
      </section>

      {selectedDataset ? <DatasetDetail dataset={selectedDataset} onClose={() => setSelected(null)} /> : null}

      <EngineCredit />
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
    <section className="flex flex-col gap-5 border-t border-border pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-heading text-fg">{dataset.name}</span>
            <span className="font-mono text-code text-accent">{dataset.barcode}</span>
          </div>
          <p className="mt-1 text-caption text-fg-muted">
            {dataset.rows} rows / {dataset.features} features / {dataset.sizeLabel} / added {dataset.addedLabel} / campaign{" "}
            <span className="font-mono text-fg">{dataset.campaignHash}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => {}}>
            <Download />
            Export CSV
          </Button>
          <Button variant="ghost" onClick={onClose} aria-label="Close dataset detail">
            <X />
            Close
          </Button>
        </div>
      </div>

      {runs.length === 0 ? (
        <EmptyState className="py-8" title="No sample runs on file for this dataset yet." />
      ) : (
        <>
          <div>
            <h3 className="mb-2 text-label text-fg">Output ranges (sample)</h3>
            <div className="flex flex-wrap gap-2">
              {ranges.map((r) => (
                <Badge key={r.name} tone="neutral" className="tabular-nums">
                  {r.name} {r.min != null ? r.min : "-"}–{r.max != null ? r.max : "-"}
                  {r.unit ? ` ${r.unit}` : ""}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-label text-fg">Sample runs</h3>
            <div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Run</TableHead>
                    {inputKeys.map((k) => (
                      <TableHead key={k} numeric>
                        {k}
                      </TableHead>
                    ))}
                    {dataset.outputs.map((k) => (
                      <TableHead key={k} numeric className="text-fg">
                        {k}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.barcode}>
                      <TableCell className="font-mono text-code text-accent">{r.barcode}</TableCell>
                      {inputKeys.map((k) => (
                        <TableCell key={k} numeric>
                          {r.inputs[k]}
                        </TableCell>
                      ))}
                      {dataset.outputs.map((k) => (
                        <TableCell key={k} numeric className="font-medium text-fg">
                          {r.outputs[k] ?? "-"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
