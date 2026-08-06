/** The small presentational pieces an Ask exchange is built from (design spec
 *  section 1.4). They are pure layout - none of them knows where its content
 *  came from, which is what lets the seeded demo conversation and any future
 *  real answer share one visual language.
 *
 *  Note on the two "actions" the design draws (the underlined "open the column
 *  map" / "show them in the batch" links): they are rendered as static text,
 *  not buttons. There is nothing behind them to open, and a hover-lit control
 *  that does nothing is a worse lie than a flat label. */
import { cn } from "@/lib/utils";

/** The reader's own message: right-aligned, capped at 88% of the panel, with
 *  the design's asymmetric corner (14px everywhere except the bottom-right,
 *  which tucks to 4px so the bubble points back at its author). */
export function UserMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[88%] self-end rounded-[14px_14px_4px_14px] bg-blue-tint px-[13px] py-[9px] text-[12.5px] leading-[1.5] text-fg">
      {children}
    </p>
  );
}

/** The answer. Newsreader, no bubble - the design deliberately gives the
 *  reader's question a container and the answer none, so the answer reads as
 *  page copy rather than as another chat turn. */
export function Answer({ children }: { children: React.ReactNode }) {
  return <p className="font-serif text-[14px] leading-[1.6] text-pretty text-fg">{children}</p>;
}

/** An ink-colored mono value inside otherwise-serif or muted prose. */
export function InlineMono({ children }: { children: React.ReactNode }) {
  return <span className="font-plex-mono tabular-nums text-fg">{children}</span>;
}

/** A bordered mono chip (a column name, an id). */
export function MonoChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[6px] border border-border bg-blue-soft px-[7px] py-[2px] font-plex-mono text-[10.5px] text-fg">
      {children}
    </span>
  );
}

/** The unbordered "+8 more" tail of a chip row. */
export function ChipOverflow({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[6px] px-[7px] py-[2px] text-[10.5px] text-muted">{children}</span>;
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-[5px]">{children}</div>;
}

/** The tinted "here is why" block under an answer: a mono key and a plain
 *  reason, one pair per row. */
export function EvidenceBlock({ rows }: { rows: { key: string; note: string }[] }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] bg-blue-soft px-3 py-2.5">
      {rows.map((row) => (
        <div key={row.key} className="flex gap-2 text-[11.5px] leading-[1.45] text-muted">
          <span className="font-plex-mono text-fg">{row.key}</span>
          <span className="min-w-0">{row.note}</span>
        </div>
      ))}
    </div>
  );
}

/** A cited SOP clause. Per DESIGN.md ("#3b5b8c rejected as a hue"), an SOP is
 *  marked out by shape and weight, never by a blue of its own. */
export function SopCitation({ clause, title, text }: { clause: string; title: string; text: string }) {
  return (
    <div className="flex items-start gap-[9px] rounded-[10px] border border-border px-3 py-[11px]">
      <span className="flex-none pt-[2px] font-plex-mono text-[10px] text-muted">{clause}</span>
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold text-fg">{title}</div>
        <p className="mt-[2px] text-[11.5px] leading-[1.45] text-muted">{text}</p>
      </div>
    </div>
  );
}

/** The provenance line that closes an exchange: where the answer came from, a
 *  hairline, then the follow-on the design offers. */
export function SourceRow({
  source,
  action,
  /** The design inks the follow-on in exchange 2 and leaves it muted in
   *  exchange 1 - the second one is the more consequential next step. */
  actionInk,
}: {
  source: React.ReactNode;
  action: string;
  actionInk?: boolean;
}) {
  return (
    <div className="flex items-center gap-[7px] text-[11px] text-muted">
      {source}
      <span className="h-[11px] w-px flex-none bg-border" aria-hidden />
      <span className={cn("underline decoration-border underline-offset-2", actionInk && "text-fg")}>{action}</span>
    </div>
  );
}

/** One exchange. Every exchange after the first carries the separator rule. */
export function Exchange({ separated, children }: { separated?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-2", separated && "border-t border-border pt-5")}>{children}</div>
  );
}

/** The recurring 10px/600 uppercase eyebrow, matching the Log tab's. */
export function AskLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">{children}</span>;
}
