"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Details one click down. Children mount on first open and then stay
 * mounted, so charts inside measure a visible box and closed disclosures cost
 * nothing on page load. Native <details>, so it works with keyboard and
 * screen readers out of the box. Use it for method details and raw engine
 * values (with human labels next to them).
 */
export function Disclosure({
  summary,
  meta,
  children,
  defaultOpen = false,
  className,
}: {
  summary: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [opened, setOpened] = useState(defaultOpen);
  return (
    <details
      open={defaultOpen || undefined}
      className={cn("group border-t border-border", className)}
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-label text-fg select-none hover:text-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-90" aria-hidden />
        <span className="min-w-0 flex-1">{summary}</span>
        {meta ? <span className="shrink-0 text-caption text-fg-muted">{meta}</span> : null}
      </summary>
      <div className="pb-4 pl-6">{opened ? children : null}</div>
    </details>
  );
}
