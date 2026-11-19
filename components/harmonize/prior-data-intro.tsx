import type { ReactNode } from "react";
import { DEFAULT_MAX_UPLOAD_MB } from "@/lib/upload-limits";

/**
 * First run: what Kalos needs from the prior data, before anything is uploaded. Every
 * statement is an engine rule (kalos-engine docs/UPLOADS.md): one sheet, at least 6 complete
 * rows, the target is always maximized, and the search box is the observed range of each
 * input (the engine takes no user bounds).
 */
export function PriorDataIntro() {
  return (
    <section aria-labelledby="prior-data-title" className="flex flex-col gap-4">
      <div>
        <h2 id="prior-data-title" className="text-heading text-fg">
          Bring your prior data
        </h2>
        <p className="mt-0.5 max-w-[68ch] text-body text-fg-muted">
          Kalos learns from runs you have already done. Upload them once; every later round builds on this sheet.
        </p>
      </div>
      <div className="grid gap-x-8 gap-y-6 border-y border-border py-5 md:grid-cols-3">
        <Block title="What Kalos needs">
          <li>
            One sheet of past runs: CSV, TSV or Excel (.xlsx), up to {DEFAULT_MAX_UPLOAD_MB} MB unless your administrator set another limit.
          </li>
          <li>One row per run, with the process inputs you set and the outcome you measured.</li>
          <li>At least 6 complete rows, with every input and the outcome filled in.</li>
          <li>Legacy Excel 97-2003 (.xls) files are refused. Save the sheet as .xlsx or CSV first.</li>
        </Block>
        <Block title="The goal">
          <li>Kalos improves one outcome column, the target. It suggests one from your column names; you can switch it after the upload.</li>
          <li>The engine always maximizes the target. There is no minimize option: to lower something, upload a column where higher is better.</li>
        </Block>
        <Block title="Operating boundaries">
          <li>Kalos searches inside the range each input already covers in your data, from its lowest to its highest observed value.</li>
          <li>You cannot enter your own bounds; the engine does not support them. To search a wider range, add runs that cover it.</li>
        </Block>
      </div>
    </section>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-label text-fg">{title}</h3>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-body text-fg-muted marker:text-border-strong">{children}</ul>
    </div>
  );
}
