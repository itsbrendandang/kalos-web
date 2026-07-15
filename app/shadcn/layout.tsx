import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

/**
 * Scoped to /shadcn only, so mounting the shadcn Toaster (used by the
 * dashboard-01 data table's row-reorder toast) doesn't touch the root
 * app/layout.tsx or any other route.
 */
export default function ShadcnLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
