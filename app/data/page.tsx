import { Barcode, Shield, Search } from "lucide-react";
import { Card, Kpi, SectionLabel } from "@/components/ui/card";
import { PageHeader, DemoBadge } from "@/components/page-header";

const DATASETS = [
  { barcode: "KAL-DS-6C103E", name: "APR07", runs: 24, outputs: "Lipase_g.L / % Purity / Conc." },
  { barcode: "KAL-DS-25B35F", name: "APR29", runs: 72, outputs: "Lipase_g.L / % Purity / Conc." },
  { barcode: "KAL-DS-BEFF9A", name: "combined_APR", runs: 96, outputs: "Lipase_g.L / % Purity / Conc." },
];

const FEATURES = [
  { icon: Barcode, title: "Stable barcodes", body: "Each dataset gets a KAL-DS-* barcode and each run a content-derived KAL-* barcode, so the same run always resolves to the same id." },
  { icon: Shield, title: "Anonymized on ingest", body: "Client and strain identity is dropped; campaign / experiment keys are hashed irreversibly. Raw identity is never stored." },
  { icon: Search, title: "Queryable & exportable", body: "Look a run up by barcode, filter by dataset, or export a flat training table for the optimizer." },
];

export default function DataPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Data room"
        title="Bioprocessing data registry"
        desc="Every uploaded dataset and run is organized under a stable barcode, with identity stripped on the way in."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi hero label="Datasets" value={DATASETS.length} />
        <Kpi label="Runs tracked" value={DATASETS.reduce((sum, d) => sum + d.runs, 0)} />
        <Kpi label="Identity state" value="Anonymized" />
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <SectionLabel className="mb-0">Registry</SectionLabel>
          <DemoBadge />
        </div>
        <div className="overflow-x-auto">
          <table className="tabular w-full border-collapse text-sm">
            <thead>
              <tr className="text-[10px] text-muted uppercase">
                <th className="border-b border-border px-3 py-2 text-left">Barcode</th>
                <th className="border-b border-border px-3 py-2 text-left">Dataset</th>
                <th className="border-b border-border px-3 py-2 text-right">Runs</th>
                <th className="border-b border-border px-3 py-2 text-left">Outputs</th>
              </tr>
            </thead>
            <tbody>
              {DATASETS.map((d) => (
                <tr key={d.barcode}>
                  <td className="border-b border-border/60 px-3 py-2 font-mono text-[12px] text-accent-hover">{d.barcode}</td>
                  <td className="border-b border-border/60 px-3 py-2 font-mono text-[12px]">{d.name}</td>
                  <td className="tabular border-b border-border/60 px-3 py-2 text-right font-mono text-[12px]">{d.runs}</td>
                  <td className="border-b border-border/60 px-3 py-2 text-[12px] text-muted">{d.outputs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-muted">
          166 runs across 3 datasets. Each run also carries its own <span className="font-mono text-fg">KAL-*</span> barcode.
          New uploads appear here after analysis.
        </p>
      </Card>

      <div className="grid gap-5 md:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="flex flex-col gap-2">
            <f.icon className="size-5 text-accent" />
            <div className="font-head text-[15px] font-semibold">{f.title}</div>
            <p className="text-[12.5px] leading-snug text-muted">{f.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
