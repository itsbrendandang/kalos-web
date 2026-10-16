"use client";

import type { ReactNode } from "react";
import { Theme } from "@carbon/react";

// Carbon components are client components; <Theme> renders the `.cds--white`
// token scope that carbon-scope.scss remaps to the Kalos palette.
export function CarbonProviders({ children }: { children: ReactNode }) {
  return (
    <Theme theme="white" className="kalos-carbon">
      {children}
    </Theme>
  );
}
