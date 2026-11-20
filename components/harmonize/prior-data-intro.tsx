import type { ReactNode } from "react";
import { DEFAULT_MAX_UPLOAD_MB } from "@/lib/upload-limits";

/**
 * First run: what Kalos needs from the prior data, before anything is uploaded. Every
 * statement is an engine rule (kalos-engine docs/UPLOADS.md, ENGINE_API_V2 section 8): one sheet,
 * at least 6 complete rows, a goal to maximize or minimize the target, and a search box that is the
 * observed range of each input, which user bounds can narrow but never widen.
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
          <li>Kalos improves one outcome column, the target. You choose it after picking the sheet, before anything is sent.</li>
          <li>You choose whether to maximize or minimize it, and can name its unit. The unit is a label only; values are never converted.</li>
        </Block>
        <Block title="Operating boundaries">
          <li>Kalos searches inside the range each input already covers in your data, from its lowest to its highest observed value.</li>
          <li>Bounds and linear constraints you set can narrow that range, never widen it: Kalos does not extrapolate. To search a wider range, add runs that cover it.</li>
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
