import { Loader2 } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-6">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2 text-[11px] font-bold tracking-[0.12em] text-accent-text uppercase">{eyebrow}</div> : null}
        <h1 className="font-head text-[32px] leading-[1.08] font-semibold tracking-[-0.03em] md:text-[38px]">{title}</h1>
        {desc ? <p className="mt-2 max-w-[68ch] text-[14px] leading-6 text-muted md:text-[15px]">{desc}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function DemoBadge() {
  return (
    <span className="rounded-full bg-explore-soft px-2.5 py-1 text-[10px] font-semibold text-explore-deep">
      Example data
    </span>
  );
}

export function Loading({ label = "Running analysis" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 py-10 font-mono text-xs text-muted"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin text-accent-text" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}
