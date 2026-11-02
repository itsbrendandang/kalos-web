"use client";

import { useMemo, useState } from "react";
import { Download, PlugZap, Search, X } from "lucide-react";
import { Card, Kpi, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Panel, Section } from "@/components/kit/section";
import { buttonVariants } from "@/components/ui/button";
import { useLatest } from "@/hooks/use-engine";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const active = status === "active";
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full text-[10px] font-semibold whitespace-nowrap",
        active ? "border-green/30 bg-green-soft text-green" : "border-border bg-card text-muted",
      )}
    >
      {status}
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

const ROLE: Record<string, string> = {
  kept_feature: "Process input",
  target: "Result being optimized",
  dropped_id: "Run label, not used",
  dropped_sparse: "Not used (text or too sparse)",
};
const roleLabel = (status: string) => ROLE[status] ?? status.replace(/_/g, " ");

/** The dataset the engine is working from, read live from the engine. With
 *  nothing uploaded, or example data off, it says so rather than inventing a list. */
function LiveRegistry() {
  const latest = useLatest();
  const d = latest.status === "error" ? null : latest.data?.has_data ? latest.data : null;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Data" title="Your data" desc="The run sheet the engine is working from, and how it read each column." />
      {latest.status === "error" ? (
        <ErrorState title="Could not reach the engine" description="This is a connection problem, not an empty registry." onRetry={() => void latest.refresh()} busy={latest.refreshing} />
      ) : !latest.data ? (
        <LoadingSkeleton rows={3} label="Loading your data" />
      ) : !d ? (
        <EmptyState
          icon={PlugZap}
          title="No data yet"
          description="Upload a run sheet in Setup and it will appear here."
          action={<Link href="/campaign/setup" className={buttonVariants({})}>Go to Setup <ArrowRight /></Link>}
        />
      ) : (
        <>
          <Panel className="flex flex-wrap items-center gap-x-10 gap-y-4">
            <div className="min-w-0">
              <p className="text-label text-fg-muted">Run sheet</p>
              <p className="text-heading text-fg break-all">{d.dataset}</p>
            </div>
            <Stat label="Runs" value={String(d.n)} />
            <Stat label="Process inputs" value={String(d.features.length)} />
            <Stat label="Optimizing" value={d.target} />
            {d.n_dropped_incomplete ? <Stat label="Rows dropped" value={String(d.n_dropped_incomplete)} sub="missing values" /> : null}
          </Panel>
          {d.provenance?.length ? (
            <Section title="How each column was read" description="Check these before trusting the model. A column marked not used did not influence the result.">
              <Panel className="px-5 py-1">
                <ul className="divide-y divide-border">
                  {d.provenance.map((c) => (
                    <li key={c.name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 py-2.5 text-body sm:grid-cols-[1fr_1fr_6rem]">
                      <span className="font-mono text-code text-fg">{c.name}</span>
                      <span className="text-fg-muted">{roleLabel(c.status)}</span>
                      <span className="w-24 text-right tabular-nums text-caption text-fg-muted">{c.non_null} filled</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </Section>
          ) : null}
        </>
      )}
      <EngineCredit />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-title tabular-nums text-fg">{value}</p>
      {sub ? <p className="text-caption text-fg-muted">{sub}</p> : null}
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

  function toggleSelect(barcode: string) {
    setSelected((cur) => (cur === barcode ? null : barcode));
  }

  if (!DEMO_MODE) return <LiveRegistry />;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Data room"
        title="Bioprocessing data registry"
        desc="Example datasets and runs, shown because example data is on."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi hero label="Datasets" value={DATASET_COUNT} />
        <Kpi label="Runs tracked" value={TOTAL_RUNS} />
        <Kpi label="Outputs tracked" value={outputsTracked} />
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
            <Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search datasets, barcodes, outputs..."
              aria-label="Search datasets"
              className="h-9 rounded-[10px] pr-3 pl-8 text-[13px]"
            />
          </div>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger aria-label="Sort datasets" className="h-9 rounded-[10px] text-[13px]">
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
          <Button variant="outline" size="sm" onClick={() => {}}>
            <Download />
            Export training table
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table className="tabular w-full border-collapse text-sm">
            <TableHeader>
              <TableRow className="border-none text-[10px] text-muted uppercase hover:bg-transparent">
                <TableHead className="border-b border-border px-3 py-2 text-left">Barcode</TableHead>
                <TableHead
                  className="cursor-pointer border-b border-border px-3 py-2 text-left select-none hover:text-fg"
                  onClick={() => setSortKey("name")}
                >
                  Dataset{sortKey === "name" ? " ▲" : ""}
                </TableHead>
                <TableHead
                  className="cursor-pointer border-b border-border px-3 py-2 text-right select-none hover:text-fg"
                  onClick={() => setSortKey(sortKey === "runs-desc" ? "runs-asc" : "runs-desc")}
                >
                  Runs{sortKey === "runs-desc" ? " ▼" : sortKey === "runs-asc" ? " ▲" : ""}
                </TableHead>
                <TableHead className="border-b border-border px-3 py-2 text-left">Outputs</TableHead>
                <TableHead className="border-b border-border px-3 py-2 text-right">Features</TableHead>
                <TableHead
                  className="cursor-pointer border-b border-border px-3 py-2 text-left select-none hover:text-fg"
                  onClick={() => setSortKey("added")}
                >
                  Added{sortKey === "added" ? " ▼" : ""}
                </TableHead>
                <TableHead className="border-b border-border px-3 py-2 text-left">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow
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
                  className={cn("cursor-pointer border-none", selected === d.barcode && "bg-blue-soft")}
                >
                  <TableCell className="border-b border-border/60 px-3 py-2 font-mono text-[12px] text-chart-1-ink">
                    {d.barcode}
                  </TableCell>
                  <TableCell className="border-b border-border/60 px-3 py-2 font-mono text-[12px]">{d.name}</TableCell>
                  <TableCell className="tabular border-b border-border/60 px-3 py-2 text-right font-mono text-[12px]">
                    {d.runs}
                  </TableCell>
                  <TableCell className="border-b border-border/60 px-3 py-2 text-[12px] text-muted">
                    {d.outputs.join(" / ")}
                  </TableCell>
                  <TableCell className="tabular border-b border-border/60 px-3 py-2 text-right font-mono text-[12px]">
                    {d.features}
                  </TableCell>
                  <TableCell className="border-b border-border/60 px-3 py-2 text-[12px] text-muted">
                    {d.addedLabel}
                  </TableCell>
                  <TableCell className="border-b border-border/60 px-3 py-2">
                    <StatusPill status={d.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            className="border-none py-8"
            title="No datasets match your search"
            description={`No dataset, barcode, or output matched “${query}”.`}
          />
        ) : null}
        <p className="mt-3 text-[12px] text-muted">
          {TOTAL_RUNS} runs across {DATASET_COUNT} dataset{DATASET_COUNT === 1 ? "" : "s"}. New uploads appear here after analysis.
        </p>
      </Card>

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

      {runs.length === 0 ? (
        <EmptyState className="border-none py-8" title="No sample runs on file for this dataset yet." />
      ) : (
        <>
          <div>
            <SectionLabel>Output ranges (sample)</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {ranges.map((r) => (
                <Badge
                  key={r.name}
                  variant="outline"
                  className="rounded-full border-border bg-blue-soft px-2.5 py-1 font-mono text-[11px] text-fg"
                >
                  {r.name} {r.min != null ? r.min : "-"}–{r.max != null ? r.max : "-"}
                  {r.unit ? ` ${r.unit}` : ""}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Sample runs</SectionLabel>
            <div className="overflow-x-auto">
              <Table className="tabular w-full border-collapse text-sm">
                <TableHeader>
                  <TableRow className="border-none text-[10px] text-muted uppercase hover:bg-transparent">
                    <TableHead className="border-b border-border px-3 py-2 text-left">Run</TableHead>
                    {inputKeys.map((k) => (
                      <TableHead key={k} className="border-b border-border px-3 py-2 text-right">
                        {k}
                      </TableHead>
                    ))}
                    {dataset.outputs.map((k) => (
                      <TableHead key={k} className="border-b border-border px-3 py-2 text-right text-chart-1-ink">
                        {k}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.barcode} className="border-none hover:bg-transparent">
                      <TableCell className="border-b border-border/60 px-3 py-2 font-mono text-[12px] text-chart-1-ink">
                        {r.barcode}
                      </TableCell>
                      {inputKeys.map((k) => (
                        <TableCell
                          key={k}
                          className="tabular border-b border-border/60 px-3 py-2 text-right font-mono text-[12px]"
                        >
                          {r.inputs[k]}
                        </TableCell>
                      ))}
                      {dataset.outputs.map((k) => (
                        <TableCell
                          key={k}
                          className="tabular border-b border-border/60 px-3 py-2 text-right font-mono text-[12px] font-semibold text-fg"
                        >
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
    </Card>
  );
}
