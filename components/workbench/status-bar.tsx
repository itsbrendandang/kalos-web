import Link from "next/link";
import type { ReactNode } from "react";
import { CircleCheck, CircleDashed, Crosshair, LoaderCircle, Trophy, TriangleAlert, Unplug, Zap } from "lucide-react";
import { cn, num } from "@/lib/utils";
import type { CampaignView } from "@/lib/workbench";

function Item({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-[3px] px-1.5 whitespace-nowrap", className)}>
      {icon}
      {children}
    </span>
  );
}

const ICON = "size-3 shrink-0";

/**
 * The workbench's status bar - VS Code's blue strip, in the kalos accent. It
 * states only what the campaign fetch actually returned: while loading it
 * says so, on a failed fetch it shows a retryable error item (never zeros),
 * and demo data is labelled as such.
 */
export function StatusBar({ view, onRetry, busy }: { view: CampaignView; onRetry: () => void; busy: boolean }) {
  return (
    <footer
      aria-label="Campaign status"
      className="flex flex-wrap items-center gap-x-1 bg-accent px-1 py-px font-mono text-[11px] text-primary-foreground"
    >
      {view.state === "loading" ? (
        <Item icon={<LoaderCircle className={cn(ICON, "animate-spin")} aria-hidden />}>loading campaign</Item>
      ) : view.state === "error" ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="inline-flex h-[22px] items-center gap-1 rounded-[3px] bg-red px-1.5 whitespace-nowrap hover:opacity-90 disabled:opacity-70"
        >
          <Unplug className={ICON} aria-hidden />
          {busy ? "retrying…" : "campaign unavailable · retry"}
        </button>
      ) : view.state === "none" ? (
        <Item icon={<Zap className={ICON} aria-hidden />}>engine connected · no campaign yet</Item>
      ) : (
        <>
          <Item icon={<Zap className={ICON} aria-hidden />}>{view.demo ? "example data" : "engine connected"}</Item>
          <Item icon={<Crosshair className={ICON} aria-hidden />}>{view.campaign.target}</Item>
          <Item>round {view.campaign.round}</Item>
          <Item icon={<CircleDashed className={ICON} aria-hidden />}>{view.campaign.n_awaiting} in flight</Item>
          <Item icon={<CircleCheck className={ICON} aria-hidden />}>{view.campaign.n_measured} measured</Item>
          <Item icon={<Trophy className={ICON} aria-hidden />}>best {view.campaign.best == null ? "-" : num(view.campaign.best, 2)}</Item>
          {!view.demo && view.campaign.analysis_in_sync === false ? (
            <Item icon={<TriangleAlert className={ICON} aria-hidden />} className="bg-amber-soft text-amber">
              batch out of date
            </Item>
          ) : null}
        </>
      )}
      <Link
        href="/decide"
        className="ml-auto inline-flex h-[22px] items-center rounded-[3px] px-1.5 whitespace-nowrap hover:bg-accent-hover"
      >
        open Decide
      </Link>
    </footer>
  );
}
