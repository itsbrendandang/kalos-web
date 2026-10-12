import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A titled block of a page. Sections are separated by whitespace, not boxes;
 * reach for Panel only when a region truly needs a boundary.
 */
export function Section({
  title,
  description,
  actions,
  children,
  id,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-heading text-fg">
            {title}
          </h2>
          {description ? <p className="mt-0.5 max-w-[68ch] text-body text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A bordered region (12px radius, hairline, no shadow), for content that needs a boundary. */
export function Panel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-border bg-surface p-5", className)} {...props} />;
}
