import { ScienceGlyph } from "@/components/shell/science-guide";
import { formatValue } from "@/lib/num";

function planned(raw: string, unit: string): string {
  return raw.trim() !== "" && Number.isFinite(Number(raw)) ? `${formatValue(Number(raw), { unit }).text}` : "Not entered";
}

/** Mirrors entered setpoints only; never a geometry, fill-level or performance model. */
export function PlannedVessel({ scale, agitation, airflow, physics }: { scale: string; agitation: string; airflow: string; physics: boolean }) {
  return <figure className="grid min-w-0 gap-5 rounded-xl bg-subtle p-5 sm:grid-cols-[auto_1fr]">
    <div className="flex flex-col gap-2"><ScienceGlyph kind="vessel" /><span className="text-caption text-fg-muted">Schematic · not data</span></div>
    <div><figcaption className="text-label text-fg">Your planned conditions <span className="mt-1 block text-caption font-normal text-fg-muted">Entered setpoints · not a prediction</span></figcaption>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div><dt className="text-caption text-fg-muted">Target scale</dt><dd className="mt-1 break-words text-body text-fg">{planned(scale,"L")}</dd></div>
        {physics ? <><div><dt className="text-caption text-fg-muted">Agitation</dt><dd className="mt-1 break-words text-body text-fg">{planned(agitation,"rpm")}</dd></div><div><dt className="text-caption text-fg-muted">Airflow</dt><dd className="mt-1 break-words text-body text-fg">{planned(airflow,"L/min")}</dd></div></> : <div className="sm:col-span-2"><dt className="text-caption text-fg-muted">Physics inputs</dt><dd className="mt-1 text-body text-fg">Agitation and airflow are not supplied.</dd></div>}
      </dl><p className="mt-4 text-caption leading-relaxed text-fg-muted">The drawing is not a geometry or fill-level model. Submitting still runs the engine&apos;s validation and gate checks.</p>
    </div>
  </figure>;
}
