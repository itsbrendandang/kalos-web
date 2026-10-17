import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-border-input bg-surface px-3 text-body text-fg transition-colors placeholder:text-fg-muted hover:border-fg-muted focus-visible:border-accent disabled:pointer-events-none disabled:bg-subtle disabled:text-fg-muted aria-invalid:border-bad file:mr-3 file:border-0 file:bg-transparent file:text-label file:text-fg",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
