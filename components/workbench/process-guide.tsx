import Link from "next/link";
import { ArrowDown, ArrowRight, BookOpen } from "lucide-react";

type Glyph = "sheet" | "model" | "reactor" | "plate" | "chart" | "record" | "access";
type Step = { label: string; detail: string; glyph: Glyph; href?: string };
type Guide = { title: string; steps: Step[] };

const prepare: Step = { label: "Measured runs", detail: "Recipes, responses and units", glyph: "sheet", href: "/campaign/setup" };
const model: Step = { label: "Fit and check", detail: "Learn associations; test held-out runs", glyph: "model", href: "/campaign/learn" };
const plan: Step = { label: "Choose experiments", detail: "Compare predictions and uncertainty", glyph: "chart", href: "/campaign/plan" };
const run: Step = { label: "Run in the lab", detail: "Follow the selected recipe", glyph: "reactor", href: "/campaign/run" };
const record: Step = { label: "Record and learn", detail: "Measured results inform the next round", glyph: "record", href: "/campaign/record" };

const GUIDES: Record<string, Guide> = {
  "/": { title: "From experiments to evidence", steps: [prepare, model, plan, run, record] },
  "/campaign/setup": { title: "Turn a run sheet into a study", steps: [prepare, { label: "Define the question", detail: "Confirm the target and process inputs", glyph: "record" }, model] },
  "/campaign/plan": { title: "Why these experiments?", steps: [model, plan, run] },
  "/campaign/run": { title: "Bring the recipe back to the bench", steps: [plan, run, record] },
  "/campaign/record": { title: "Close the experimental loop", steps: [run, { label: "Match run and response", detail: "Save the measured value, not a prediction", glyph: "record" }, model] },
  "/campaign/learn": { title: "Understand what the experiment taught you", steps: [prepare, model, plan] },
  "/data": { title: "Keep the evidence traceable", steps: [prepare, { label: "Check the schema", detail: "Separate process inputs from outcomes", glyph: "record" }, { label: "Follow the evidence", detail: "Return to the campaign that used it", glyph: "chart", href: "/campaign/learn" }] },
  "/library": { title: "Choose the question before the tool", steps: [{ label: "Observe", detail: "Inspect plates and vessel measurements", glyph: "plate", href: "/library/plate" }, { label: "Predict", detail: "Explore a planned change of scale", glyph: "reactor", href: "/library/scale-up" }, { label: "Experiment", detail: "Plan, measure, then update the model", glyph: "model", href: "/campaign/plan" }] },
  "/library/scale-up": { title: "From measured conditions to a scale-up question", steps: [prepare, { label: "Planned conditions", detail: "Scale, process inputs and available physics", glyph: "reactor" }, { label: "Readout and limits", detail: "Review the engine report and gate checks", glyph: "chart" }] },
  "/library/plate": { title: "Read a plate from pattern to measurement", steps: [{ label: "Plate layout", detail: "Locate conditions and control wells", glyph: "plate" }, { label: "Quality checks", detail: "Inspect flags and control separation", glyph: "record" }, { label: "Growth curves", detail: "Compare a well with its replicate", glyph: "chart" }] },
  "/library/vessels": { title: "Connect vessel conditions with culture behavior", steps: [{ label: "Vessel measurements", detail: "Follow the measured culture over time", glyph: "reactor" }, { label: "Growth and production", detail: "Compare trajectories, not only endpoints", glyph: "chart" }, { label: "Context and quality", detail: "Check units and measurement provenance", glyph: "record" }] },
  "/library/simulator": { title: "Study optimization before a lab experiment", steps: [{ label: "Synthetic problem", detail: "A test landscape, not a biological claim", glyph: "model" }, { label: "Search strategy", detail: "Explore uncertainty or exploit a prediction", glyph: "chart" }, { label: "Compare rounds", detail: "Read synthetic progress and trade-offs", glyph: "record" }] },
};

function guideFor(pathname: string): Guide | null {
  if (GUIDES[pathname]) return GUIDES[pathname];
  if (pathname.startsWith("/projects")) return { title: "Keep the scientific decision connected to its evidence", steps: [{ label: "Study objective", detail: "Define the outcome and its context", glyph: "record" }, { label: "Experiments", detail: "Compare recipes and their evidence", glyph: "reactor" }, { label: "Decision and report", detail: "Keep example and live results distinct", glyph: "chart" }] };
  if (pathname.startsWith("/settings")) return { title: "Your research workspace", steps: [{ label: "Your identity", detail: "Sign-in and two-factor settings", glyph: "access", href: "/settings/security" }, { label: "Your organization", detail: "Members and invitation access", glyph: "model", href: "/settings/organization" }, { label: "Your workspace", detail: "Appearance and engine connection", glyph: "sheet", href: "/settings" }] };
  return null;
}

/** Original schematics, not measurements or a claim that an engine task has run. */
export function ProcessGuide({ pathname }: { pathname: string }) {
  const guide = guideFor(pathname);
  if (!guide) return null;
  return (
    <figure className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="text-label font-medium text-fg">{guide.title}</h2>
        <span className="text-caption text-fg-muted">Process guide · not live status</span>
      </figcaption>
      <ol className={guide.steps.length > 3 ? "grid gap-3 sm:grid-cols-3 xl:grid-cols-5" : "grid gap-3 sm:grid-cols-3"}>
        {guide.steps.map((step, index) => {
          const content = <><span className="shrink-0"><ProcessGlyph kind={step.glyph} /></span><span className="block min-w-0"><span className="mt-1 block break-words text-label font-medium text-fg">{step.label}</span><span className="mt-1 block break-words text-caption leading-relaxed text-fg-muted">{step.detail}</span></span></>;
          return <li key={step.label} className="relative min-w-0">
            {step.href ? <Link href={step.href} className="flex h-full items-start gap-3 rounded-lg bg-subtle p-3 transition-colors hover:bg-accent-soft sm:block">{content}</Link> : <div className="flex h-full items-start gap-3 rounded-lg bg-subtle p-3 sm:block">{content}</div>}
            {index < guide.steps.length - 1 ? <><ArrowRight aria-hidden className={`absolute -right-3 top-7 z-10 hidden size-3 text-fg-muted ${guide.steps.length > 3 && index === 2 ? "xl:block" : "sm:block"}`} /><ArrowDown aria-hidden className="absolute -bottom-3 left-8 z-10 size-3 text-fg-muted sm:hidden" /></> : null}
          </li>;
        })}
      </ol>
      <details className="mt-3 text-caption text-fg-muted">
        <summary className="w-fit cursor-pointer rounded hover:text-fg"><BookOpen aria-hidden className="mr-1 inline size-3" />Scientific reading behind these guides</summary>
        <p className="mt-2 max-w-[90ch] leading-relaxed">Original explanatory schematics, not vendor artwork or calculated results. Learn more about <a className="underline underline-offset-2" href="https://www.sartorius.com/en/products/data-analytics/modde" target="_blank" rel="noreferrer">design of experiments</a>, <a className="underline underline-offset-2" href="https://www.jmp.com/support/help/en/19.2/jmp/profiler-features-in-jmp.shtml" target="_blank" rel="noreferrer">model visualization</a> and <a className="underline underline-offset-2" href="https://www.cytivalifesciences.com/en/us/solutions/bioprocessing/products-and-solutions/upstream-bioprocessing/single-use-bioreactors/digital-bioreactor-scaling-tool" target="_blank" rel="noreferrer">bioreactor scaling</a>. These references are not endorsements or integrations.</p>
      </details>
    </figure>
  );
}

function ProcessGlyph({ kind }: { kind: Glyph }) {
  return <svg viewBox="0 0 100 56" aria-hidden="true" className="h-12 w-20 max-w-full text-fg sm:h-14 sm:w-24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    {kind === "reactor" ? <><path d="M29 13h42v28c0 9-42 9-42 0V13M25 13h50M40 7v6m20-6v6M50 4v33m-11-7 22 10m0-10L39 40" /><path d="M31 29c10-7 26 7 38 0v12c-4 6-33 6-38 0Z" fill="var(--brand)" stroke="none" opacity=".55" /><path d="M50 17v20m-11-7 22 10m0-10L39 40M78 22h10v17H77" /><circle cx="86" cy="17" r="4" /></> : null}
    {kind === "sheet" || kind === "record" ? <><rect x="25" y="4" width="50" height="47" rx="5" fill="var(--surface)" /><path d="M35 15h30M35 24h18m-18 9h18m-18 9h18" />{kind === "record" ? <path d="m59 35 5 5 10-13" stroke="var(--ok)" strokeWidth="2.5" /> : <path d="M59 23h6m-6 10h6m-6 9h6" />}</> : null}
    {kind === "model" ? <>{[[25,15],[25,42],[50,8],[50,28],[50,48],[78,20],[78,40]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="5" fill={i === 3 ? "var(--brand)" : "var(--surface)"} />)}<path d="m30 15 15-7m-15 9 15 10m-15-7 15 27M30 39 45 10M30 42l15-14m-15 16 15 4M55 9l18 11M55 28l18-8M55 29l18 11M55 48l18-8" /></> : null}
    {kind === "plate" ? <><rect x="13" y="7" width="74" height="43" rx="5" fill="var(--surface)" />{Array.from({length:24},(_,i)=><circle key={i} cx={24+(i%6)*10.5} cy={17+Math.floor(i/6)*9} r="3" fill={i%4===0 ? "var(--brand)" : "var(--subtle)"} />)}</> : null}
    {kind === "chart" ? <><path d="M17 8v39h70M23 39l14-6 14 3 16-17 14-5" /><path d="M23 32l14-7 14 4 16-19 14-4v17l-14 5-16 15-14-3-14 8Z" fill="var(--brand)" stroke="none" opacity=".6" />{[[23,39],[37,33],[51,36],[67,19],[81,14]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="2.5" fill="var(--surface)" />)}</> : null}
    {kind === "access" ? <><path d="M50 4 73 13v17c0 11-23 22-23 22S27 41 27 30V13Z" fill="var(--brand)" /><rect x="40" y="25" width="20" height="14" rx="3" fill="var(--surface)" /><path d="M44 25v-7a6 6 0 0 1 12 0v7m-6 5v4" /></> : null}
  </svg>;
}
