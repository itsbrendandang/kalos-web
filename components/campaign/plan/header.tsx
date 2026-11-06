import type { ReactNode } from "react";

/** The page column: one flex stack with the page's own rhythm. */
export function PlanFrame({ children }: { children: ReactNode }) {
  return <div className="@container flex flex-col gap-6">{children}</div>;
}

/** Title block: campaign and dataset above, "Plan round N" below, and an optional action on the right. */
export function PlanHeader({ round, eyebrow, meta, action }: { round?: number; eyebrow?: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="mb-1 text-label text-fg-muted">{eyebrow}</p> : null}
        <h1 className="text-display text-fg">{round != null ? `Plan round ${round}` : "Plan"}</h1>
        {meta}
      </div>
      {action ? <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">{action}</div> : null}
    </header>
  );
}

export function DatasetEyebrow({ name }: { name: string }) {
  return (
    <>
      Campaign <span aria-hidden>·</span> <span className="font-mono text-code">{name}</span>
    </>
  );
}
