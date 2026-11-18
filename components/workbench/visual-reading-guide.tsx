import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const GUIDES = [
  { key: "interval", title: "Read uncertainty, not just a point", body: "An interval is not a guaranteed outcome. Check how it was calculated and how often it covered held-out measurements.", href: "/campaign/learn", link: "Review model calibration" },
  { key: "heatmap", title: "See patterns, then check the controls", body: "Compare wells on the same color scale. Missing values, control wells and quality flags matter as much as a bright region.", href: "/library/plate", link: "Explore plate analysis" },
  { key: "surface", title: "A surface is a model, not a measurement", body: "A response surface varies two inputs while holding others fixed. A predicted peak still needs experimental evidence.", href: "/campaign/plan", link: "Explore experiment planning" },
] as const;

/** Educational drawings with no numeric data; never stand-ins for engine outputs. */
export function VisualReadingGuide() {
  return <section aria-labelledby="visual-reading-title" className="flex flex-col gap-5 border-t border-border pt-8">
    <header><h2 id="visual-reading-title" className="text-heading text-fg">Learn the visual language</h2><p className="mt-2 max-w-[75ch] text-body text-fg-muted">Three ways to read the science. These drawings explain a visual idea; they are not study results.</p></header>
    <div className="grid gap-5 xl:grid-cols-3">
      {GUIDES.map(guide=><figure key={guide.key} className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-5">
        <span className="text-caption text-fg-muted">Schematic · not data</span>
        <svg viewBox="0 0 260 126" aria-hidden="true" className="my-4 h-32 w-full text-fg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {guide.key === "interval" ? <><path d="M25 104h215M35 96V23m-5 0h10m-10 73h10" stroke="var(--border-strong)" /><path d="M65 40h150m-150-8v16m150-16v16M102 78h76m-76-8v16m76-16v16" stroke="var(--chart-predicted)" strokeWidth="3" /><circle cx="140" cy="40" r="7" fill="var(--brand)" /><circle cx="140" cy="78" r="7" fill="var(--brand)" /><path d="M140 101v7" /><text x="130" y="122" fill="currentColor" stroke="none" fontSize="12" textAnchor="middle">Same center, different uncertainty</text></> : null}
          {guide.key === "heatmap" ? <><rect x="56" y="9" width="148" height="96" rx="6" />{Array.from({length:24},(_,i)=><rect key={i} x={66+(i%6)*22} y={19+Math.floor(i/6)*21} width="17" height="16" rx="3" stroke="var(--border-strong)" fill={`var(--chart-seq-${[1,2,3,4,3,2,2,3,4,5,4,2,3,4,5,5,4,1,2,3,4,4,2,1][i]})`} />)}<text x="130" y="122" fill="currentColor" stroke="none" fontSize="12" textAnchor="middle">Position + color + quality context</text></> : null}
          {guide.key === "surface" ? <><path d="M35 14v88h194" stroke="var(--border-strong)" /><ellipse cx="140" cy="53" rx="75" ry="35" transform="rotate(-17 140 53)" fill="var(--brand)" opacity=".55" stroke="none" /><ellipse cx="140" cy="53" rx="75" ry="35" transform="rotate(-17 140 53)" /><ellipse cx="140" cy="53" rx="52" ry="24" transform="rotate(-17 140 53)" /><ellipse cx="140" cy="53" rx="29" ry="13" transform="rotate(-17 140 53)" /><path d="m137 49 7 7m0-7-7 7" strokeWidth="2" /><text x="130" y="122" fill="currentColor" stroke="none" fontSize="12" textAnchor="middle">Two inputs; other conditions held fixed</text></> : null}
        </svg>
        <figcaption className="flex flex-1 flex-col"><h3 className="text-heading text-fg">{guide.title}</h3><p className="mt-3 text-body leading-relaxed text-fg-muted">{guide.body}</p><Link href={guide.href} className="mt-auto inline-flex items-center gap-2 pt-5 text-label text-fg underline underline-offset-4">{guide.link}<ArrowUpRight aria-hidden className="size-3.5 shrink-0" /></Link></figcaption>
      </figure>)}
    </div>
  </section>;
}
