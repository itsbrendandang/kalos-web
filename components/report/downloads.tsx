"use client";

import { useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveText } from "@/components/report/save-file";
import { formatValue } from "@/lib/num";
import { packageFilename, packageJson, proposalsCsv, runsCsv, type DataPackage } from "@/lib/report-package";

// A UTF-8 byte-order mark so spreadsheet apps read units such as µ correctly.
const BOM = "\uFEFF";

/**
 * The three exports and Print. The builders assemble a fresh package at click
 * time, so `generated_at` and the file date are the moment of download; the
 * JSON package also reads the full result history and audit log first.
 */
export function Downloads({
  pkg,
  build,
  buildFull,
  campaignName,
  generatedAt,
}: {
  /** The package shown on the page, for counts and the file names previewed. */
  pkg: DataPackage;
  /** A fresh package from what the page holds (for the CSVs). */
  build: () => DataPackage;
  /** A fresh package after reading every history page (for the JSON package). */
  buildFull: () => Promise<DataPackage>;
  campaignName: string;
  generatedAt: number;
}) {
  const [preparing, setPreparing] = useState(false);
  const nRuns = pkg.runs.length;
  const nProposals = pkg.proposals.length;

  const files = [
    {
      key: "package" as const,
      label: "Download data package (JSON)",
      detail: "Everything on this page, with provenance and the full result history, in one file.",
      disabled: preparing,
      primary: true,
      save: async () => {
        setPreparing(true);
        try {
          const fresh = await buildFull();
          saveText(packageFilename(campaignName, "package", new Date(fresh.generated_at)), packageJson(fresh), "application/json");
        } finally {
          setPreparing(false);
        }
      },
    },
    {
      key: "runs" as const,
      label: "Runs (CSV)",
      detail: nRuns ? `${formatValue(nRuns, { quantity: "count" }).text} started runs, measured and predicted in separate columns.` : "No runs have been started yet.",
      disabled: nRuns === 0,
      primary: false,
      save: () => {
        const fresh = build();
        saveText(packageFilename(campaignName, "runs", new Date(fresh.generated_at)), BOM + runsCsv(fresh), "text/csv;charset=utf-8");
      },
    },
    {
      key: "batch" as const,
      label: "Proposed batch (CSV)",
      detail: nProposals ? `${formatValue(nProposals, { quantity: "count" }).text} proposed recipes, predictions only.` : "The analysis has no proposed batch.",
      disabled: nProposals === 0,
      primary: false,
      save: () => {
        const fresh = build();
        saveText(packageFilename(campaignName, "batch", new Date(fresh.generated_at)), BOM + proposalsCsv(fresh), "text/csv;charset=utf-8");
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3 print:hidden">
      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
        {files.map((f) => (
          <li key={f.key} className="flex flex-col items-start gap-1.5">
            <Button variant={f.primary ? "default" : "outline"} onClick={() => void f.save()} disabled={f.disabled}>
              {f.key === "package" && preparing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download aria-hidden />}
              {f.label}
            </Button>
            <p className="text-caption text-fg-muted">{f.detail}</p>
            <p className="font-mono text-caption break-words text-fg-muted">{packageFilename(campaignName, f.key, generatedAt)}</p>
          </li>
        ))}
      </ul>
      <div>
        <Button variant="ghost" size="sm" onClick={() => window.print()}>
          <Printer aria-hidden />
          Print this report
        </Button>
      </div>
    </div>
  );
}
