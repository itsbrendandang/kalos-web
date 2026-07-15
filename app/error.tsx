"use client"; // Error boundaries must be Client Components (Next.js app router)

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Top-level route error boundary (app/error.tsx). Wraps every page/layout
 * below the root layout - if a render throws anywhere in the tree (e.g. a
 * chart fed a malformed result), this replaces the crashed page with a
 * recoverable card instead of a blank/broken screen. The root layout itself
 * (app/layout.tsx, including the AppShell nav) is NOT inside this boundary
 * and keeps rendering normally around it.
 *
 * Next 16.2 added `unstable_retry`, which re-fetches and re-renders the
 * boundary's children and is now the recommended recovery action (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md);
 * `reset()` still exists for clearing error state without re-fetching, but
 * the docs say to prefer `unstable_retry` in most cases, so that is what the
 * button here calls.
 */
export default function GlobalErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 border-red/30 bg-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-red">
            <AlertCircle className="size-5" />
          </span>
          <div>
            <div className="font-head text-[16px] font-semibold text-fg">Something went wrong</div>
            <p className="mt-1 max-w-[62ch] text-[13px] leading-5 text-explore-deep">
              This page hit an unexpected error while rendering. Try again, or head back and pick a different
              experiment or page.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => unstable_retry()}>
          <RefreshCw />
          Try again
        </Button>
      </Card>
    </div>
  );
}
