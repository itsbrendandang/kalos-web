import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { campaignHref, parseCampaignPath } from "@/lib/routes";

type Glyph = "sheet" | "model" | "vessel" | "chart" | "record";
type Step = { title: string; detail: string; glyph: Glyph; href: string };

/** Original explanatory drawings. The shell's separate stepper owns live status. */
export function ScienceGuide({ pathname }: { pathname: string }) {
  const campaign = parseCampaignPath(pathname);
  if (!campaign && pathname !== "/scale-up") return null;
  const href = (page: "harmonize" | "predict" | "validate" | "report" | "scale-up") => campaign ? campaignHref(campaign.id, page) : "/scale-up";
  const steps: Step[] = campaign?.page === "scale-up" || pathname === "/scale-up" ? [
    { title: "Measured conditions", detail: "A source sheet, response and units", glyph: "sheet", href: href("scale-up") },
    { title: "Planned conditions", detail: "Entered setpoints, not measured performance", glyph: "vessel", href: href("scale-up") },
    { title: "Readout & limits", detail: "Review the engine's answer and gate checks", glyph: "chart", href: href("scale-up") },
  ] : campaign?.page === "report" ? [
    { title: "Trace the source", detail: "Keep the analysis and its input fingerprint", glyph: "sheet", href: href("harmonize") },
    { title: "Keep evidence distinct", detail: "Model estimates are not lab measurements", glyph: "chart", href: href("validate") },
    { title: "Export the record", detail: "Take the campaign package with its caveats", glyph: "record", href: href("report") },
  ] : [
    { title: "Harmonize", detail: "Check the source, column roles and explored space", glyph: "sheet", href: href("harmonize") },
    { title: "Predict", detail: "Compare proposed recipes and model uncertainty", glyph: "model", href: href("predict") },
    { title: "Validate", detail: "Run in the lab, record measurements, learn", glyph: "vessel", href: href("validate") },
  ];
  return (
    <details className="group mb-8 min-w-0 rounded-xl bg-surface px-4 py-4 sm:px-5 print:hidden">
      <summary className="cursor-pointer text-label text-fg"><BookOpen aria-hidden className="mr-2 inline size-4" /> How this science fits together <span className="ml-2 inline-block text-caption font-normal text-fg-muted">Process guide · not live status</span></summary>
      <ol className="mt-5 grid gap-4 sm:grid-cols-3">
        {steps.map((step, index) => <li key={step.title} className="relative min-w-0"><Link href={step.href} className="flex h-full items-start gap-3 rounded-lg bg-subtle p-4 hover:bg-accent-soft sm:flex-col"><ScienceGlyph kind={step.glyph} /><span className="min-w-0"><span className="block text-label text-fg">{step.title}</span><span className="mt-1 block text-caption leading-relaxed text-fg-muted">{step.detail}</span></span></Link>{index < steps.length - 1 ? <ArrowRight aria-hidden className="absolute -right-4 top-8 hidden size-4 text-fg-muted sm:block" /> : null}</li>)}
      </ol>
      <p className="mt-4 text-caption leading-relaxed text-fg-muted">Original schematics, not data or a completed engine task. Reading: <a className="underline underline-offset-2" href="https://www.sartorius.com/en/products/data-analytics/modde" target="_blank" rel="noreferrer">design of experiments</a> and <a className="underline underline-offset-2" href="https://www.jmp.com/support/help/en/19.2/jmp/profiler-features-in-jmp.shtml" target="_blank" rel="noreferrer">model visualization</a>. Not endorsements or integrations.</p>
    </details>
  );
}

export function ScienceGlyph({ kind }: { kind: Glyph }) {
  return <svg viewBox="0 0 90 58" width="90" height="58" className="max-w-full shrink-0 text-fg" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
    {kind === "sheet" ? <><rect x="17" y="4" width="54" height="49" rx="5" fill="var(--subtle)" /><path d="M27 16h34M27 26h34M27 36h34M38 12v32M51 12v32" /><circle cx="56" cy="43" r="9" fill="var(--brand)" /><path d="m52 43 3 3 5-6" /></> : kind === "vessel" ? <><path d="M25 13h40v28c0 14-40 14-40 0Z" fill="var(--subtle)" /><ellipse cx="45" cy="13" rx="20" ry="7" /><path d="M45 2v39M34 34h22M37 28l16 12M53 28 37 40M18 5v22h7M65 22h10V8" /><path d="M28 36q8-6 17 0t17 0" stroke="var(--chart-3)" /><circle cx="57" cy="23" r="2" fill="var(--brand)" /></> : kind === "model" ? <><path d="M8 49h74M13 50V6" opacity=".4" /><path d="M17 43c13-2 15-30 30-24s17 17 31-6" stroke="var(--chart-predicted)" strokeWidth="2" />{[[22,41],[34,25],[49,21],[65,26],[76,14]].map(([x,y]) => <circle key={x} cx={x} cy={y} r="3" fill="var(--fg)" />)}<path d="m18 49 60-40" strokeDasharray="3 3" opacity=".4" /></> : kind === "chart" ? <><path d="M10 49h70M16 49V8" opacity=".4" />{[[26,38,13],[45,27,18],[66,17,11]].map(([x,y,r]) => <g key={x}><path d={`M${x-r} ${y}h${r*2}`} stroke="var(--chart-predicted)" strokeWidth="2" /><circle cx={x} cy={y} r="4" fill="var(--surface)" stroke="var(--chart-predicted)" /></g>)}</> : <><rect x="21" y="8" width="48" height="44" rx="5" fill="var(--subtle)" /><path d="M34 8V4h22v8H34Z" fill="var(--brand)" /><path d="m29 26 3 3 5-6M43 26h17m-31 13 3 3 5-6M43 39h17" /></>}
  </svg>;
}
