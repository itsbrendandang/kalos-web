export function PageHeader({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-head text-2xl font-semibold tracking-tight">{title}</h1>
        {desc ? <p className="mt-1 max-w-[62ch] text-[13.5px] text-muted">{desc}</p> : null}
      </div>
      {action}
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
  return <div className="py-10 text-center font-mono text-xs text-muted">Running the engine…</div>;
}
