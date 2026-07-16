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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[11px] font-semibold text-accent-text">{eyebrow}</div> : null}
        <h1 className="font-head text-[26px] leading-tight font-semibold">{title}</h1>
        {desc ? <p className="mt-1.5 max-w-[68ch] text-[13.5px] leading-5 text-muted">{desc}</p> : null}
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

export function Loading() {
  return <div className="py-10 text-center font-mono text-xs text-muted">Running analysis...</div>;
}
