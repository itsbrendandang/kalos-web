import type { ReactNode } from "react";
import "./carbon-scope.scss";
import { CarbonProviders } from "./providers";

// Pilot-only layout: the sole place Carbon's styles are imported, and every
// rule in that stylesheet is nested under `.carbon-pilot` (see carbon-scope.scss).
export default function CarbonPilotLayout({ children }: { children: ReactNode }) {
  return (
    <div className="carbon-pilot">
      <CarbonProviders>{children}</CarbonProviders>
    </div>
  );
}
