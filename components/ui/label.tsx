"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("flex items-center gap-2 text-label text-fg select-none peer-disabled:text-fg-muted", className)}
      {...props}
    />
  );
}

export { Label };
