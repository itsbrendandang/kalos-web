"use client";

import { cn } from "@/lib/utils";
import type { MapLens } from "@/lib/workspace/map-types";

/** The "Bordered segmented switch" from DESIGN_SPEC.md section 7, used for
 *  the Map tab's lens switch (3.1). Deliberately a different treatment from
 *  the Log/Map/Brief tab control above it - hairline border around the group
 *  instead of a filled track - because it is a second-level control nested to
 *  the right of a first-level one. */
const LENSES: { id: MapLens; label: string }[] = [
  { id: "lineage", label: "Lineage" },
  { id: "interactions", label: "Interactions" },
  { id: "surface", label: "Surface" },
];

export function LensSwitch({ value, onChange }: { value: MapLens; onChange: (lens: MapLens) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Map lens"
      className="flex items-center gap-0.5 rounded-[10px] border border-border p-[3px]"
    >
      {LENSES.map((lens) => (
        <button
          key={lens.id}
          type="button"
          role="tab"
          aria-selected={lens.id === value}
          onClick={() => onChange(lens.id)}
          className={cn(
            "rounded-[7px] px-[11px] py-[5px] text-[11.5px] transition-colors",
            lens.id === value ? "bg-action font-semibold text-white" : "text-muted hover:text-fg",
          )}
        >
          {lens.label}
        </button>
      ))}
    </div>
  );
}
