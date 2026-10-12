import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Low-level banner shell. New code uses Callout (components/kit/callout.tsx). */
const alertVariants = cva(
  "relative grid w-full gap-0.5 rounded-lg border px-4 py-3 text-left text-body has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-border bg-surface text-fg",
        destructive: "border-bad bg-bad-soft text-fg *:[svg]:text-bad",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("text-label text-fg group-has-[>svg]/alert:col-start-2", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-body text-fg-muted [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-3", className)}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-action" className={cn("absolute top-2 right-2", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
