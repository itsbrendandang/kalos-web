"use client";

import { usePathname } from "next/navigation";
import { GreekKey } from "@/components/brand/kalos-mark";
import { maximFor } from "@/lib/maxims";

/** A Greek-key rule and one Delphic maxim, at the foot of every page. */
export function MaximFooter() {
  const m = maximFor(usePathname() ?? "/");
  return (
    <footer className="mt-16 flex flex-col items-center gap-3 pb-2 text-center">
      <GreekKey className="max-w-48" />
      <p className="text-label text-fg">
        <span lang="grc">{m.greek}</span>
        <span className="text-fg-muted"> · {m.english}</span>
      </p>
      <p className="text-caption text-fg-muted">{m.note}</p>
    </footer>
  );
}
