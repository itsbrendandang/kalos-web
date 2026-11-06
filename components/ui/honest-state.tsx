import type { ComponentType, ReactNode } from "react";
import { Inbox, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { WHY_PREFIX, whyLine } from "@/lib/why";

/**
 * The shared "did the request work" vocabulary. Every surface that talks to
 * Kalos picks one of these three, and none of them may be substituted for
 * another:
 *
 *  - ErrorState  - the request to Kalos failed. This is a fact about the
 *                  NETWORK/SERVICE, not the lab. Copy must say so explicitly
 *                  (never "no data"). Its default copy is the connection
 *                  error with its why-line; a page that names another
 *                  failure passes its own title and, when the code has one,
 *                  its why-line.
 *  - EmptyState  - the service answered and the answer was nothing. A
 *                  confirmed-empty result is a fact about the DATA.
 *  - LoadingSkeleton - the request is in flight. Shaped like the content it
 *                  will become, not a centered spinner, so the layout does
 *                  not jump when the real content lands.
 *
 * Conflating ErrorState and EmptyState is the exact bug this file exists to
 * prevent: a dropped connection must never be reported as a scientific
 * finding about the lab. Resolve loading before empty: render EmptyState only
 * once a request has answered, never while it is still in flight.
 */

export const UNREACHABLE_TITLE = "Could not reach Kalos";
export const UNREACHABLE_DESCRIPTION = "This is a connection problem, not a result; nothing you entered is lost.";

export function ErrorState({
  title = UNREACHABLE_TITLE,
  description = UNREACHABLE_DESCRIPTION,
  why = title === UNREACHABLE_TITLE ? whyLine("engine_unreachable") : null,
  onRetry,
  retryLabel = "Try again",
  busy = false,
  className,
}: {
  title?: string;
  description?: ReactNode;
  /** The "Why this matters" line (lib/why.ts) under the description; on by default for the connection error. */
  why?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  busy?: boolean;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-2xl glass p-4", className)}>
      <WifiOff className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label text-fg">{title}</p>
        <div className="mt-1 text-body text-fg-muted">{description}</div>
        {why ? (
          <p className="mt-1 text-body text-fg-muted">
            {WHY_PREFIX} {why}
          </p>
        ) : null}
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} disabled={busy} className="mt-3">
            {busy ? "Trying again..." : retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title?: string;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      <span className="grid size-10 place-items-center rounded-full bg-subtle text-fg-muted">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-heading text-fg">{title}</p>
      {description ? <div className="max-w-[48ch] text-body text-fg-muted">{description}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

type SkeletonVariant = "rows" | "card" | "table" | "chart";

const ROW_WIDTHS = ["w-full", "w-full", "w-5/6", "w-full", "w-2/3", "w-full"];

export function LoadingSkeleton({
  variant = "rows",
  rows = 3,
  label = "Loading",
  className,
}: {
  variant?: SkeletonVariant;
  rows?: number;
  label?: string;
  className?: string;
}) {
  const common = { role: "status" as const, "aria-live": "polite" as const, "aria-label": label };

  if (variant === "chart") {
    return (
      <div className={cn("space-y-2.5", className)} {...common}>
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-[220px] w-full rounded-lg" />
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={cn("space-y-1.5", className)} {...common}>
        <Skeleton className="h-8 w-full rounded-md" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)} {...common}>
        {Array.from({ length: rows }).map((_, i) => (
          <Card key={i}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-6 w-16" />
            <Skeleton className="mt-2 h-3 w-28" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)} {...common}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", ROW_WIDTHS[i % ROW_WIDTHS.length])} />
      ))}
    </div>
  );
}
