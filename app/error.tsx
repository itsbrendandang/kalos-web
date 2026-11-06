"use client"; // Error boundaries must be Client Components (Next.js app router)

import { useEffect } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/honest-state";

/**
 * Top-level route error boundary (app/error.tsx). Wraps every page/layout
 * below the root layout - if a render throws anywhere in the tree (e.g. a
 * chart fed a malformed result), this replaces the crashed page with the
 * shared ErrorState instead of a blank/broken screen. The root layout itself
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
    <div className="flex flex-col gap-4">
      <ErrorState title="This page hit an error" description="Try again, or go back to the Overview." onRetry={() => unstable_retry()} />
      <div>
        <Link href="/" className={buttonVariants({ variant: "ghost", className: "-ml-4" })}>
          Go to the Overview
        </Link>
      </div>
    </div>
  );
}
