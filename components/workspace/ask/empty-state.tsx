/** What this panel shows by default, which is to say: what almost everyone
 *  will see. Campaign question-answering does not exist in the kalos engine -
 *  there is no route that takes a question, and no SOP corpus to cite - and
 *  both were deferred as separate products, so this is not a loading state and
 *  will not resolve into one.
 *
 *  It is written to read as a finished, deliberate panel rather than an empty
 *  one: a serif statement of the gap, a named list of the two things that have
 *  to exist first, and a pointer at the surfaces that DO answer these
 *  questions today. Structurally it anchors to the top of the body while the
 *  "Try asking" group anchors to the bottom (see AskPanel's `mt-auto`), so the
 *  space between them reads as composition instead of absence. */
import { AskLabel } from "./primitives";

const REQUIREMENTS: { key: string; note: string }[] = [
  {
    key: "answering endpoint",
    note: "The engine serves runs, rounds, and analyses. It has no route that takes a question and returns prose.",
  },
  {
    key: "indexed SOP corpus",
    note: "Citations of the kind this panel is shaped around need SOPs stored and searchable. None are indexed.",
  },
];

export function AskEmptyState() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-[17px] leading-[1.35] font-semibold tracking-[-0.01em] text-pretty text-fg">
        Asking about a campaign is not built yet.
      </h2>
      <p className="text-[12.5px] leading-[1.55] text-muted">
        This panel is the surface for it. Nothing behind it can answer a question about this campaign today, so the box
        below is disabled rather than quietly swallowing what you type.
      </p>

      <div className="mt-1 flex flex-col gap-2.5 rounded-[10px] bg-blue-soft px-3 py-3">
        <AskLabel>Needed first</AskLabel>
        {REQUIREMENTS.map((r) => (
          <div key={r.key} className="flex flex-col gap-0.5">
            <span className="font-plex-mono text-[11px] text-fg">{r.key}</span>
            <span className="text-[11.5px] leading-[1.45] text-muted">{r.note}</span>
          </div>
        ))}
      </div>

      <p className="text-[11.5px] leading-[1.5] text-muted">
        Until both exist, the Log and Map tabs carry the evidence an answer would have cited: this campaign&rsquo;s
        runs, its rounds, and which inputs moved the result.
      </p>
    </section>
  );
}
