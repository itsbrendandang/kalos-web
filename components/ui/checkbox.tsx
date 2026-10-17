import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A native checkbox with a 24px hit area (WCAG 2.5.8) and a 16px visible box
 * drawn with the --border-input token. The real input is the 24px target, so
 * it keeps native keyboard, form and label behavior.
 */
function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <span data-slot="checkbox" className={cn("relative inline-grid size-6 shrink-0 place-items-center", className)}>
      <input type="checkbox" className="peer absolute inset-0 size-6 cursor-pointer opacity-0 disabled:cursor-not-allowed" {...props} />
      <span
        aria-hidden
        className="pointer-events-none grid size-4 place-items-center rounded-[4px] border border-border-input bg-surface text-accent-fg peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50 peer-checked:[&>svg]:block"
      >
        <Check className="hidden size-3" strokeWidth={3} />
      </span>
    </span>
  );
}

export { Checkbox };
