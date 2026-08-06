"use client";

// The local-graph mode switch and its settings cog (DESIGN_SPEC.md 5.1).
//
// Same "bordered segmented switch" chrome as the lens switch beside it, with
// two items instead of three. The cog is 32x32 and fills with the action token
// while the settings panel is open; its closed state is the neutral bordered
// icon button the rest of this system uses (the mock only ever shows the open
// state - DESIGN_SPEC.md gap list #5 flags the idle style as inferred).
import { cn } from "@/lib/utils";

export type MapMode = "campaign" | "local";

export function GraphModeSwitch({
  mode,
  onChange,
  localLabel,
}: {
  mode: MapMode;
  onChange: (mode: MapMode) => void;
  /** "Around Run 118", or "Around a run" when the campaign has no run it can
   *  name to centre on - which is the usual case today. */
  localLabel: string;
}) {
  const items: { id: MapMode; label: string }[] = [
    { id: "campaign", label: "Whole campaign" },
    { id: "local", label: localLabel },
  ];
  return (
    <div role="tablist" aria-label="Graph scope" className="flex items-center gap-0.5 rounded-[10px] border border-border p-[3px]">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === mode}
          onClick={() => onChange(item.id)}
          className={cn(
            "whitespace-nowrap rounded-[7px] px-[11px] py-[5px] text-[11.5px] transition-colors motion-reduce:transition-none",
            item.id === mode ? "bg-action font-semibold text-white" : "text-muted hover:text-fg",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function GraphSettingsButton({
  open,
  onToggle,
  disabled,
  disabledReason,
}: {
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={open}
      aria-label="Graph settings"
      title={disabled ? disabledReason : "Graph settings"}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[10px] border text-[13px] transition-colors motion-reduce:transition-none",
        open ? "border-action bg-action text-white" : "border-border text-muted hover:bg-blue-soft hover:text-fg",
        disabled && "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-muted",
      )}
    >
      <span aria-hidden>⚙</span>
    </button>
  );
}
