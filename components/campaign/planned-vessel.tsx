import { formatNumber } from "@/lib/format";

function planned(raw: string, unit: string): string {
  return raw.trim() !== "" && Number.isFinite(Number(raw)) ? `${formatNumber(Number(raw))} ${unit}` : "Not entered";
}

/** Mirrors the user's setpoints only. It never predicts physical performance. */
export function PlannedVessel({ scale, agitation, airflow, physics }: { scale: string; agitation: string; airflow: string; physics: boolean }) {
  return <figure className="h-fit min-w-0 rounded-xl bg-subtle p-5">
    <figcaption><h3 className="text-label font-medium text-fg">Your planned conditions</h3><p className="mt-1 text-caption text-fg-muted">Entered setpoints · not a prediction</p></figcaption>
    <svg viewBox="0 0 240 220" role="img" aria-label="Schematic bioreactor showing mixing, air supply and working volume" className="mx-auto my-5 w-full max-w-64 text-fg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M64 48h105v125c0 27-105 27-105 0Z" fill="var(--surface)" />
      <path d="M66 114c21-13 71 14 101 0v59c0 23-101 23-101 0Z" stroke="none" fill="var(--brand)" opacity=".7" />
      <path d="M57 48h120M93 48V28h47v20M116 11v145m-24-23 49 25m0-25-49 25M92 177h50M181 155h20V82h-20" />
      <circle cx="201" cy="70" r="9" /><path d="m197 73 6-6M116 8h-15m30 0h-15M76 195v13m80-13v13" />
      {[112,127,142,157].map((y,i)=><circle key={y} cx={83+(i%2)*5} cy={y} r={2+i%2} stroke="var(--fg-muted)" />)}
      <path d="M22 86h42m105 30h51M116 20h54" stroke="var(--fg-muted)" strokeDasharray="3 4" />
    </svg>
    <dl className="flex flex-col gap-4 text-body">
      <div><dt className="text-caption text-fg-muted">Target scale</dt><dd className="mt-1 break-words font-mono text-fg">{planned(scale,"L")}</dd></div>
      {physics ? <><div><dt className="text-caption text-fg-muted">Agitation</dt><dd className="mt-1 break-words font-mono text-fg">{planned(agitation,"rpm")}</dd></div><div><dt className="text-caption text-fg-muted">Airflow</dt><dd className="mt-1 break-words font-mono text-fg">{planned(airflow,"L/min")}</dd></div></> : <div><dt className="text-caption text-fg-muted">Physics inputs</dt><dd className="mt-1 text-fg">Agitation and airflow are not supplied.</dd></div>}
    </dl>
    <p className="mt-5 border-t border-border pt-4 text-caption leading-relaxed text-fg-muted">Schematic only. The drawing is not a geometry or fill-level model; submitting the form still runs the engine&apos;s validation and gate checks.</p>
  </figure>;
}
