import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The top of every page: one title, one sentence saying what the page is for,
 * and at most one primary action (a verb + object, e.g. "Start 5 runs").
 * `meta` holds small status badges beside the title (e.g. ExampleBadge).
 */
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  meta,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-x-6", className)}>
      <div className="min-w-0 sm:flex-1">
        {eyebrow ? <p className="mb-1 text-label text-fg-muted">{eyebrow}</p> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 text-title break-words text-fg">{title}</h1>
          {meta}
        </div>
        {description ? <p className="mt-1.5 max-w-[68ch] text-body text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex w-full shrink-0 items-center gap-2 *:max-sm:flex-1 sm:w-auto">{action}</div> : null}
    </header>
  );
}
