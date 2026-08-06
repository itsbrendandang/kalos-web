import { Diamond, X } from "lucide-react";
import { DEMO_MODE } from "@/lib/demo";
import { AskComposer } from "./ask/composer";
import { AskEmptyState } from "./ask/empty-state";
import { SeededExchanges } from "./ask/seeded-exchanges";
import { TryAsking } from "./ask/try-asking";

/** The Ask panel (design spec section 1.4): a 56px header matching the
 *  workspace header exactly, a scrolling body, and a composer pinned to the
 *  bottom.
 *
 *  There is no assistant behind this panel. The kalos engine exposes no
 *  answering endpoint and indexes no SOPs, and both were deferred as separate
 *  products, so the full composition is built while the behaviour is honestly
 *  absent: the composer is disabled with its reason legible, the design's two
 *  seeded exchanges render only behind NEXT_PUBLIC_DEMO_MODE under a visible
 *  DemoBadge, and the default view is an empty state that names the gap.
 *
 *  Layout note: the body's last child carries `mt-auto`. With the seeded
 *  conversation on, the body overflows and the margin does nothing; with it
 *  off, it pins "Try asking" just above the composer so the panel reads as two
 *  deliberately-anchored clusters rather than one sentence adrift in 900px. */
export function AskPanel({
  onClose,
  summaryLine,
}: {
  onClose: () => void;
  summaryLine: string;
}) {
  return (
    <aside className="box-border flex h-full w-[340px] flex-none flex-col border-l border-border bg-card">
      <header className="box-border flex h-14 shrink-0 items-center gap-[9px] border-b border-border px-[18px]">
        <span className="grid size-5 shrink-0 place-items-center rounded-[10px] bg-action text-white">
          <Diamond className="size-[10px]" fill="currentColor" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-bold tracking-[-0.005em] text-fg">Ask about this campaign</div>
          <div className="mt-px truncate font-plex-mono text-[10px] text-muted">{summaryLine}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close Ask panel"
          className="grid size-[26px] shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-blue-soft hover:text-fg"
        >
          <X className="size-[13px]" aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-[18px] py-5">
        {DEMO_MODE ? <SeededExchanges /> : <AskEmptyState />}
        <TryAsking className="mt-auto" />
      </div>

      <AskComposer />
    </aside>
  );
}
