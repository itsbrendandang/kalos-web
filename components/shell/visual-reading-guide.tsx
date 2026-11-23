import Link from "next/link";
import { ScienceGlyph } from "@/components/shell/science-guide";
import { campaignHref } from "@/lib/routes";

export function VisualReadingGuide({ campaignId }: { campaignId: string }) {
  const guides = [
    { title: "Read uncertainty, not just a point", detail: "A model estimate is not a measurement. Check what its band represents and whether held-out evidence supports it.", glyph: "chart" as const, page: "predict" as const, link: "Review predictions" },
    { title: "A pattern is not a cause", detail: "Correlation and recipe similarity help you explore the sheet. Check the column roles, units and missing values before interpreting a pattern.", glyph: "sheet" as const, page: "harmonize" as const, link: "Inspect study data" },
    { title: "Close the loop with measurements", detail: "Record what the lab measured against the correct run. Held-out model checks and campaign run records are different evidence.", glyph: "vessel" as const, page: "validate" as const, link: "Review measured runs" },
  ];
  return <section aria-labelledby="reading-title" className="flex flex-col gap-5">
    <div><h2 id="reading-title" className="text-heading text-fg">A visual field guide</h2><p className="mt-1 text-body text-fg-muted">Three ways to read the science without confusing an estimate with evidence.</p></div>
    <div className="grid gap-4 md:grid-cols-3">{guides.map((g) => <article key={g.title} className="flex min-w-0 flex-col items-start gap-4 rounded-xl bg-subtle p-5"><div className="flex w-full flex-wrap items-center justify-between gap-2"><ScienceGlyph kind={g.glyph} /><span className="text-caption text-fg-muted">Schematic · not data</span></div><h3 className="text-label text-fg">{g.title}</h3><p className="text-body leading-relaxed text-fg-muted">{g.detail}</p><Link className="mt-auto pt-1 text-label text-accent underline-offset-4 hover:underline" href={campaignHref(campaignId, g.page)}>{g.link} →</Link></article>)}</div>
  </section>;
}
